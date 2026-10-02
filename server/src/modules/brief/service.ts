import {
  BriefEnvelope,
  BriefModelOutput,
  FEATURE_MODELS,
  type BriefResponse,
  type ChatMessage,
  type Intent,
  type Provider,
  type UnifiedDiff,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConfigError, ConflictError, NotFoundError } from '../../platform/errors.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { toBlastRadius } from '../_shared/blast-map.js';
import { hunkHeadersByFile } from '../_shared/hunk-headers.js';
import { resolveLinkedIssue, type LinkedIssueResult } from '../_shared/linked-issue.js';
import { resolveProjectContext } from '../_shared/project-context.js';
import { resolvePrContext, usableClonePath } from '../_shared/pr-context.js';
import { computeContextFingerprint } from '../_shared/pr-context-truncate.js';
import { sanitizePathForLog } from '../_shared/context-paths.js';
import { classifyFile } from '../_shared/smart-diff-roles.js';
import {
  BRIEF_ATTEMPT_TIMEOUT_MS,
  BRIEF_FEATURE_ID,
  BRIEF_MODEL_DEADLINE_MS,
  BRIEF_PROMPT_FILE,
  BRIEF_SCHEMA_NAME,
  ERROR_ALREADY_GENERATING,
  ERROR_PULL_NOT_FOUND,
  LAST_ERROR_GENERATE_FAILED,
  LAST_ERROR_MODEL_FAILED,
  LAST_ERROR_NOT_CONFIGURED,
  LAST_ERROR_TIMEOUT,
  MAX_FILES,
  OUTCOME_FAILED,
  OUTCOME_OK,
  OUTCOME_TIMEOUT,
  PROMPT_TOKEN_CAP,
  SCHEMA_RETRIES,
  SPEC_DOCS_TOKEN_BUDGET,
} from './constants.js';
import {
  blastFiles,
  buildBriefPrompt,
  computeMissingInputs,
  computeStale,
  groundBrief,
  orderFiles,
  type SpecDoc,
} from './helpers.js';
import { BriefRepository, type BriefPull } from './repository.js';

export type BriefLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

class BriefDeadlineError extends Error {}

/**
 * Per-PR in-memory generation lock. Valid only for a SINGLE API instance per
 * database (server/CLAUDE.md). It is held until the underlying model call
 * SETTLES, not until the deadline: the call cannot be cancelled, so releasing
 * earlier would let a second paid call run beside an orphan one.
 */
const generating = new Set<string>();

/** Test hook: forget every held lock. */
export function resetBriefLocks(): void {
  generating.clear();
}

export interface BriefServiceOptions {
  /** Overall model deadline; injectable so the deadline/lock race is testable. */
  deadlineMs?: number;
}

interface ModelChoice {
  provider: Provider;
  model: string;
}

export class BriefService {
  private repo: BriefRepository;
  private deadlineMs: number;

  constructor(
    private container: Container,
    opts: BriefServiceOptions = {},
  ) {
    this.repo = new BriefRepository(container.db);
    this.deadlineMs = opts.deadlineMs ?? BRIEF_MODEL_DEADLINE_MS;
  }

  private async requirePull(workspaceId: string, prId: string): Promise<BriefPull> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError(ERROR_PULL_NOT_FOUND);
    return pull;
  }

  /** The workspace override for `risk_brief`, else the registry default, read at call time (AC-30). */
  private async resolveModel(workspaceId: string): Promise<ModelChoice> {
    const override = await this.repo.getFeatureModelOverride(workspaceId, BRIEF_FEATURE_ID);
    if (override) return { provider: override.provider, model: override.model };
    const def = FEATURE_MODELS.find((f) => f.id === BRIEF_FEATURE_ID);
    return { provider: (def?.defaultProvider ?? 'openai') as Provider, model: def?.defaultModel ?? '' };
  }

  /** GET — the stored brief with computed `generating`, `stale`, `missing_inputs`. Never calls the model. */
  async get(workspaceId: string, prId: string): Promise<BriefResponse> {
    const pull = await this.requirePull(workspaceId, prId);
    const stored = await this.repo.getStored(workspaceId, prId);
    const parsed = stored === undefined ? undefined : BriefEnvelope.safeParse(stored);
    const isGenerating = generating.has(prId);
    // EC-21: an invalid document reads as no brief; an error-only one is valid.
    if (!parsed?.success) {
      return { brief: null, meta: null, generating: isGenerating, stale: false, missing_inputs: [] };
    }
    const { brief, missing_inputs, ...meta } = parsed.data;
    return {
      brief: brief ?? null,
      meta,
      generating: isGenerating,
      stale: brief ? computeStale(meta.generated_for_sha, pull.headSha) : false,
      missing_inputs: missing_inputs ?? [],
    };
  }

  /**
   * POST — 404 for a foreign PR, `ConfigError` when the resolved provider has
   * no key (before the lock), 409 while the lock is held, else run in the
   * background. The caller returns 202 immediately.
   */
  async startGenerate(workspaceId: string, prId: string, log?: BriefLogger): Promise<void> {
    const pull = await this.requirePull(workspaceId, prId);
    const choice = await this.resolveModel(workspaceId);
    // EC-1: throws ConfigError for a missing key, before the lock and before any call.
    const llm = await this.container.llm(choice.provider);
    if (generating.has(prId)) throw new ConflictError(ERROR_ALREADY_GENERATING);
    generating.add(prId);
    void this.run(workspaceId, pull, choice, llm, log);
  }

  /** Never rejects. Releases the lock once the model call has settled. */
  private async run(
    workspaceId: string,
    pull: BriefPull,
    choice: ModelChoice,
    llm: Awaited<ReturnType<Container['llm']>>,
    log?: BriefLogger,
  ): Promise<void> {
    const started = Date.now();
    let callSettled: Promise<unknown> = Promise.resolve();
    let outcome: string = OUTCOME_FAILED;
    let callStarted = false;
    const stats = {
      tokensIn: 0,
      tokensOut: 0,
      costUsd: null as number | null,
      attempts: 0,
      droppedRisks: 0,
      droppedRefs: 0,
      droppedFocus: 0,
    };
    try {
      const inputs = await this.gather(workspaceId, pull);
      callStarted = true;
      const call = llm.completeStructured({
        model: choice.model,
        schema: BriefModelOutput,
        schemaName: BRIEF_SCHEMA_NAME,
        messages: inputs.messages,
        maxRetries: SCHEMA_RETRIES,
        timeoutMs: BRIEF_ATTEMPT_TIMEOUT_MS,
      });
      callSettled = call.then(
        () => undefined,
        () => undefined,
      );
      const result = await this.withDeadline(call, log, { prId: pull.id, ...choice });
      const grounded = groundBrief(result.data, inputs.allowedFiles);
      stats.tokensIn = result.tokensIn;
      stats.tokensOut = result.tokensOut;
      stats.costUsd = result.costUsd;
      stats.attempts = result.attempts;
      stats.droppedRisks = grounded.dropped.risks;
      stats.droppedRefs = grounded.dropped.refs;
      stats.droppedFocus = grounded.dropped.focus;
      await this.repo.mergeEnvelope(workspaceId, pull.id, {
        brief: grounded.brief,
        intent: inputs.intent,
        blast: inputs.blast,
        generated_for_sha: pull.headSha,
        generated_at: new Date().toISOString(),
        provider: choice.provider,
        model: result.model || choice.model,
        missing_inputs: computeMissingInputs({ ...inputs.facts, promptTrimmed: inputs.promptTrimmed }),
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: result.costUsd,
        last_error: null,
        last_error_at: null,
        context_fingerprint: inputs.contextFingerprint,
      });
      outcome = OUTCOME_OK;
    } catch (err) {
      outcome = err instanceof BriefDeadlineError ? OUTCOME_TIMEOUT : OUTCOME_FAILED;
      await this.repo
        .mergeEnvelope(workspaceId, pull.id, {
          last_error: this.failureMessage(err, callStarted),
          last_error_at: new Date().toISOString(),
        })
        .catch(() => undefined);
    } finally {
      // NFR-8 / NFR-13: one line per accepted generation; no prompt text, description, issue or spec content.
      log?.info(
        {
          prId: pull.id,
          provider: choice.provider,
          model: choice.model,
          tokensIn: stats.tokensIn,
          tokensOut: stats.tokensOut,
          costUsd: stats.costUsd,
          attempts: stats.attempts,
          droppedRisks: stats.droppedRisks,
          droppedRefs: stats.droppedRefs,
          droppedFocus: stats.droppedFocus,
          durationMs: Date.now() - started,
          outcome,
        },
        'brief generation finished',
      );
      void callSettled.finally(() => generating.delete(pull.id));
    }
  }

  /**
   * Race the call against the deadline. On the deadline the caller records a
   * timeout; a later resolution is discarded (only its cost is logged).
   */
  private withDeadline<T extends { tokensIn: number; tokensOut: number; costUsd: number | null }>(
    call: Promise<T>,
    log: BriefLogger | undefined,
    ctx: Record<string, unknown>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let expired = false;
      const timer = setTimeout(() => {
        expired = true;
        reject(new BriefDeadlineError('deadline'));
      }, this.deadlineMs);
      call.then(
        (value) => {
          clearTimeout(timer);
          if (expired) {
            log?.warn(
              { ...ctx, tokensIn: value.tokensIn, tokensOut: value.tokensOut, costUsd: value.costUsd },
              'brief model call settled after the deadline; result discarded',
            );
            return;
          }
          resolve(value);
        },
        (err: unknown) => {
          clearTimeout(timer);
          if (!expired) reject(err);
        },
      );
    });
  }

  private failureMessage(err: unknown, callStarted: boolean): string {
    if (err instanceof BriefDeadlineError) return LAST_ERROR_TIMEOUT;
    if (err instanceof ConfigError) return LAST_ERROR_NOT_CONFIGURED;
    // Raw provider messages can echo request content: never stored.
    return callStarted ? LAST_ERROR_MODEL_FAILED : LAST_ERROR_GENERATE_FAILED;
  }

  /** Collect every input and build the messages. Each optional source degrades to "missing". */
  private async gather(workspaceId: string, pull: BriefPull) {
    const c = this.container;
    const repoRow = await c.reviewRepo.getRepo(pull.repoId);
    const repoRef = { owner: repoRow?.owner ?? '', name: repoRow?.name ?? '' };

    const rows = await this.repo.getFiles(workspaceId, pull.id);
    const allFiles = orderFiles(rows.map((r) => ({ ...r, role: classifyFile(r.path) })));
    const files = allFiles.slice(0, MAX_FILES);
    const prPaths = allFiles.map((f) => f.path);

    const diff = this.diffFromPatches(files);
    const hunkHeaders = hunkHeadersByFile(diff);

    const stored = await c.reviewRepo.getIntent(pull.id).catch(() => undefined);
    const intent: Intent | null = stored
      ? {
          intent: stored.intent,
          in_scope: stored.in_scope,
          out_of_scope: stored.out_of_scope,
          confidence: stored.confidence,
          sources: stored.sources,
        }
      : null;

    let blast: ReturnType<typeof toBlastRadius> | null;
    try {
      blast = toBlastRadius(await c.repoIntel.getBlastRadius(pull.repoId, prPaths));
    } catch {
      blast = null; // EC-9: generate without it, named in missing_inputs
    }

    const issue: LinkedIssueResult = await resolveLinkedIssue({ container: c, repoRef, body: pull.body });
    // SPEC-07: the list was read once with the pull at the start of the run
    // (EC-13). Non-empty → PR context replaces the SPEC-04 fallback.
    const attachedPaths = pull.contextPaths ?? [];
    const prResolved =
      attachedPaths.length > 0
        ? await resolvePrContext({
            git: c.git,
            tokenizer: c.tokenizer,
            repo: repoRef,
            clonePath: await usableClonePath(repoRow?.clonePath ?? null),
            pr: { number: pull.number, headSha: pull.headSha, contextPaths: attachedPaths },
          }).catch(() => null)
        : null;
    const fallback =
      attachedPaths.length > 0
        ? { specs: [] as SpecDoc[], overBudget: [] as string[] }
        : await this.resolveSpecs(workspaceId, repoRow);
    const { specs, overBudget: specsOverBudget } = fallback;
    const prDocs: SpecDoc[] = prResolved ? prResolved.sent : [];

    const system = await loadPromptTemplate(BRIEF_PROMPT_FILE);
    const count = (text: string) => c.tokenizer.count(text);
    const prompt = buildBriefPrompt({
      title: pull.title,
      description: pull.body,
      issueText: issue.status === 'used' ? (issue.text ?? null) : null,
      intent,
      blast,
      files: files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions, role: f.role })),
      hunkHeaders,
      specs,
      prContext: prDocs,
      budget: Math.max(0, PROMPT_TOKEN_CAP - count(system)),
      count,
    });
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: prompt.text },
    ];

    const prIssues: string[] = [];
    if (attachedPaths.length > 0) {
      if (prResolved) {
        for (const e of prResolved.entries) {
          if (e.status !== 'attached') prIssues.push(`${sanitizePathForLog(e.path)} (${e.status})`);
        }
      } else {
        for (const p of attachedPaths) prIssues.push(`${sanitizePathForLog(p)} (unreadable)`);
      }
      for (const p of prompt.droppedPrContext) prIssues.push(`${sanitizePathForLog(p)} (dropped)`);
    }

    return {
      messages,
      // AC-31: a resolver failure still yields a fingerprint (every path unresolved).
      contextFingerprint:
        attachedPaths.length === 0
          ? null
          : (prResolved?.fingerprint ??
            computeContextFingerprint(
              attachedPaths.map((path) => ({ path, blobId: null, status: 'unreadable' })),
            )),
      intent,
      blast,
      allowedFiles: new Set<string>([...prPaths, ...blastFiles(blast)]),
      promptTrimmed: prompt.trimmed,
      facts: {
        description: pull.body,
        issue,
        intent: stored ? { classifiedForSha: stored.classifiedForSha } : null,
        headSha: pull.headSha,
        blast,
        specCount: specs.length,
        specsOverBudget,
        totalFiles: allFiles.length,
        ...(attachedPaths.length > 0 ? { prContext: { issues: prIssues } } : {}),
      },
    };
  }

  /** Patches are parsed only to read hunk numbers; no body line is kept. */
  private diffFromPatches(files: readonly { path: string; patch: string | null }[]): UnifiedDiff {
    const parts: string[] = [];
    for (const f of files) {
      if (!f.patch) continue;
      parts.push(`diff --git a/${f.path} b/${f.path}`, `--- a/${f.path}`, `+++ b/${f.path}`, f.patch);
    }
    return parseUnifiedDiff(parts.join('\n'));
  }

  /**
   * One merged, de-duplicated project-context read over every enabled agent's
   * and enabled skill's documents, under the smaller spec budget. Only
   * attached, non-empty entries count (F9); `overBudget` names the ones the
   * budget skipped. Never throws.
   */
  private async resolveSpecs(
    workspaceId: string,
    repoRow: Awaited<ReturnType<Container['reviewRepo']['getRepo']>>,
  ): Promise<{ specs: SpecDoc[]; overBudget: string[] }> {
    if (!repoRow) return { specs: [], overBudget: [] };
    try {
      const agents = await this.container.agentsRepo.listEnabled(workspaceId);
      const agentPaths = [...new Set(agents.flatMap((a) => a.contextPaths))];
      const skills = new Map<string, { name: string; body: string; contextPaths: string[] }>();
      for (const agent of agents) {
        for (const s of await this.container.agentsRepo.enabledSkillsForPrompt(agent.id)) {
          if (!skills.has(s.id)) skills.set(s.id, s);
        }
      }
      const resolved = await resolveProjectContext({
        git: this.container.git,
        tokenizer: this.container.tokenizer,
        repo: { owner: repoRow.owner, name: repoRow.name },
        clonePath: repoRow.clonePath,
        agentPaths,
        skills: [...skills.values()],
        budget: SPEC_DOCS_TOKEN_BUDGET,
      });
      return {
        specs: resolved.entries
          .filter((e) => e.status === 'attached' && e.text.trim().length > 0)
          .map((e) => ({ path: e.path, text: e.text })),
        overBudget: resolved.entries.filter((e) => e.status === 'over_budget').map((e) => e.path),
      };
    } catch {
      return { specs: [], overBudget: [] };
    }
  }
}
