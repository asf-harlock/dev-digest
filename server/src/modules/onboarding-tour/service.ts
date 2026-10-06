import {
  FEATURE_MODELS,
  type ChatMessage,
  type Provider,
  Onboarding,
  type OnboardingTourGenerateRequest,
  type OnboardingTourResponse,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConfigError, ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { loadPromptTemplate, renderTemplate } from '../../platform/prompts.js';
import { cloneDirExists } from '../_shared/project-context.js';
import { scanClone } from './clone-files.js';
import {
  ERROR_ALREADY_GENERATING,
  ERROR_REPO_NOT_FOUND,
  DEFAULT_WINDOW_DAYS,
  ERROR_ACTIVITY_NO_CLONE,
  FALLBACK_ACTIVITY_UNAVAILABLE,
  HISTORY_BUDGET_MS,
  GENERATE_FAILED_MESSAGE,
  LAST_ERROR_MODEL_FAILED,
  LAST_ERROR_NOT_CONFIGURED,
  LAST_ERROR_TIMEOUT,
  TOUR_FEATURE_ID,
  TOUR_LANGUAGE,
  TOUR_LLM_MAX_RETRIES,
  TOUR_LLM_TIMEOUT_MS,
  TOUR_PROMPT_FILE,
  TOUR_SCHEMA_NAME,
  TOUR_TOKEN_BUDGET,
  RANKED_FILES_LIMIT,
  REASON_BY_INDEX,
  REASON_INDEX_UNAVAILABLE,
  REASON_MODEL_NOT_CONFIGURED,
  REASON_NOT_CLONED,
  REASON_NO_INDEX,
} from './constants.js';
import { buildFactsPrompt, mergeGrounded } from './enrichment.js';
import { applyHotness, buildSkeleton, computeStale } from './helpers.js';
import { RawTour } from './tour-schema.js';
import { OnboardingTourRepository, type TourRepoRow } from './repository.js';
import type { RankedFile, TourFacts } from './types.js';

export type TourLogger = {
  info?: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

class TourTimeoutError extends Error {}

/** Race `p` against a timer; the timer is always cleared. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TourTimeoutError('timeout')), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Record a failure: the plain message in `last_error`, its ISO time in `last_error_at`. */
function setFailure(meta: Onboarding['meta'], message: string, at: Date): void {
  meta.last_error = message;
  meta.last_error_at = at.toISOString();
}

/**
 * Per-repo in-memory generation lock. Valid only for a SINGLE API instance per
 * database (server/CLAUDE.md); replicas would allow two concurrent runs. The
 * lock is lost on restart by design — nothing is persisted as "running".
 */
const generating = new Set<string>();

/** Mode + window as accepted from the request; slice 2 only builds import-graph skeletons. */
type GenerateOptions = Pick<OnboardingTourGenerateRequest, 'mode' | 'window_days'>;

export class OnboardingTourService {
  private repo: OnboardingTourRepository;

  constructor(
    private container: Container,
    private opts: { llmTimeoutMs?: number; historyTimeoutMs?: number } = {},
  ) {
    this.repo = new OnboardingTourRepository(container.db);
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<TourRepoRow> {
    const row = await this.repo.getRepo(workspaceId, repoId);
    if (!row) throw new NotFoundError(ERROR_REPO_NOT_FOUND);
    return row;
  }

  private async cloned(repo: TourRepoRow): Promise<boolean> {
    return Boolean(repo.clonePath) && (await cloneDirExists(repo.clonePath!));
  }

  /** `{provider, model}` for the tour: the workspace override, else the registry default. No key, no call (Q7). */
  private async modelHint(workspaceId: string): Promise<{ provider: string; model: string }> {
    const override = await this.repo.getFeatureModelOverride(workspaceId, TOUR_FEATURE_ID);
    if (override) return override;
    const def = FEATURE_MODELS.find((f) => f.id === TOUR_FEATURE_ID);
    return { provider: def?.defaultProvider ?? '', model: def?.defaultModel ?? '' };
  }

  /** GET — the stored tour, or a skeleton built live (`stored:false`). Never throws on a missing index. */
  async get(workspaceId: string, repoId: string): Promise<OnboardingTourResponse> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const [cloned, state, hint] = await Promise.all([
      this.cloned(repo),
      this.container.repoIntel.getIndexState(repoId).catch(() => null),
      this.modelHint(workspaceId),
    ]);
    const currentSha = state?.lastIndexedSha || null;
    const storedRow = await this.repo.getStored(workspaceId, repoId);
    const parsed = storedRow ? Onboarding.safeParse(storedRow.json) : undefined;

    let tour: Onboarding;
    let stored = false;
    if (parsed?.success) {
      tour = parsed.data;
      stored = true;
    } else {
      tour = buildSkeleton(await this.collectFacts(repo, cloned, {}));
    }
    return {
      stored,
      generating: generating.has(repoId),
      stale: stored && computeStale(storedRow?.headSha, currentSha),
      tour,
      model_hint: hint,
      file_count: state?.filesIndexed ?? 0,
      can_use_activity: cloned,
    };
  }

  /**
   * POST generate — takes the lock synchronously (409 when held), then runs in
   * the background. The caller returns 202 immediately.
   */
  async startGenerate(
    workspaceId: string,
    repoId: string,
    opts: GenerateOptions,
    log?: TourLogger,
  ): Promise<void> {
    const repo = await this.requireRepo(workspaceId, repoId);
    // EC-8: activity ranking reads the clone's git history, so it needs a clone.
    if (opts.mode === 'activity' && !(await this.cloned(repo))) {
      throw new ValidationError(ERROR_ACTIVITY_NO_CLONE);
    }
    if (generating.has(repoId)) throw new ConflictError(ERROR_ALREADY_GENERATING);
    generating.add(repoId);
    void this.generate(workspaceId, repo, opts, log)
      .catch(async (err: unknown) => {
        log?.warn({ repoId, err: err instanceof Error ? err.message : String(err) }, 'onboarding tour generation failed');
        await this.recordFailure(workspaceId, repoId).catch(() => undefined);
      })
      .finally(() => generating.delete(repoId));
  }

  /**
   * Skeleton first, then at most ONE model call to enrich it. A degraded index
   * (EC-1) stores the skeleton without calling the model. Failures never throw
   * past here: see `storeFailure` for the EC-2 / EC-3 / EC-7 rules.
   */
  private async generate(
    workspaceId: string,
    repo: TourRepoRow,
    opts: GenerateOptions,
    log?: TourLogger,
  ): Promise<void> {
    const started = Date.now();
    const cloned = await this.cloned(repo);
    const facts = await this.collectFacts(repo, cloned, opts);
    const skeleton = buildSkeleton(facts);
    const hint = await this.modelHint(workspaceId);
    const provider = hint.provider as Provider;
    // NFR-12: identifying context for every log line. Never prompt text.
    const logCtx = {
      repoId: repo.id,
      provider,
      model: hint.model,
      ranking_mode: facts.mode,
      window_days: facts.windowDays,
      ranking_fallback: facts.rankingFallback !== null,
    };

    if (facts.degradedReason) {
      // B1: a stored model tour is never replaced by a skeleton; the reason is recorded instead.
      const existing = await this.storedTour(workspaceId, repo.id);
      if (existing?.tour.meta.source === 'llm') {
        setFailure(existing.tour.meta, facts.degradedReason, new Date());
        await this.repo.upsert(workspaceId, repo.id, existing.tour, existing.row.generatedAt);
      } else {
        await this.storeSkeleton(workspaceId, repo.id, skeleton);
      }
      log?.info?.({ ...logCtx, outcome: 'skeleton_degraded', ms: Date.now() - started }, 'onboarding tour generated');
      return;
    }

    const count = (text: string) => this.container.tokenizer.count(text);
    const system = renderTemplate(await loadPromptTemplate(TOUR_PROMPT_FILE), { language: TOUR_LANGUAGE });
    // NFR-6: the budget covers the WHOLE model input, so the facts get what the system prompt leaves.
    const prompt = buildFactsPrompt(facts, count, Math.max(0, TOUR_TOKEN_BUDGET - count(system)));
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: prompt.text },
    ];
    const tokens = this.container.tokenizer.count(messages.map((m) => m.content).join('\n'));

    let raw: RawTour;
    try {
      const llm = await this.container.llm(provider);
      const result = await withTimeout(
        llm.completeStructured({
          model: hint.model,
          schema: RawTour,
          schemaName: TOUR_SCHEMA_NAME,
          messages,
          maxRetries: TOUR_LLM_MAX_RETRIES,
          timeoutMs: TOUR_LLM_TIMEOUT_MS,
        }),
        this.opts.llmTimeoutMs ?? TOUR_LLM_TIMEOUT_MS,
      );
      raw = result.data;
    } catch (err) {
      const message = this.failureMessage(err);
      // NFR-12: no prompt text, no raw provider message (it can echo request content).
      log?.warn(
        { ...logCtx, tokens, truncated: prompt.truncated, outcome: message, ms: Date.now() - started },
        'onboarding tour model call failed',
      );
      await this.storeFailure(workspaceId, repo.id, skeleton, message);
      return;
    }

    const now = new Date();
    const tour = mergeGrounded(skeleton, raw, facts, {
      provider,
      model: hint.model,
      generatedAt: now.toISOString(),
      truncated: prompt.truncated,
    });
    await this.repo.upsert(workspaceId, repo.id, tour, now);
    log?.info?.(
      {
        ...logCtx,
        tokens,
        truncated: prompt.truncated,
        dropped: tour.meta.dropped_count,
        outcome: 'llm',
        ms: Date.now() - started,
      },
      'onboarding tour generated',
    );
  }

  private failureMessage(err: unknown): string {
    if (err instanceof TourTimeoutError) return LAST_ERROR_TIMEOUT;
    if (err instanceof ConfigError) return LAST_ERROR_NOT_CONFIGURED;
    return LAST_ERROR_MODEL_FAILED;
  }

  private async storeSkeleton(workspaceId: string, repoId: string, skeleton: Onboarding): Promise<void> {
    const now = new Date();
    skeleton.meta.generated_at = now.toISOString();
    await this.repo.upsert(workspaceId, repoId, skeleton, now);
  }

  private async storedTour(workspaceId: string, repoId: string) {
    const row = await this.repo.getStored(workspaceId, repoId);
    const parsed = row ? Onboarding.safeParse(row.json) : undefined;
    return row && parsed?.success ? { row, tour: parsed.data } : undefined;
  }

  /**
   * EC-3: a stored model tour is kept untouched except `last_error` (and its
   * own generated time stays). EC-2 / EC-7: otherwise the skeleton is stored
   * with `last_error` so the page can explain why it is not model-written.
   */
  private async storeFailure(workspaceId: string, repoId: string, skeleton: Onboarding, message: string): Promise<void> {
    const at = new Date();
    const existing = await this.storedTour(workspaceId, repoId);
    if (existing?.tour.meta.source === 'llm') {
      setFailure(existing.tour.meta, message, at);
      await this.repo.upsert(workspaceId, repoId, existing.tour, existing.row.generatedAt);
      return;
    }
    if (message === LAST_ERROR_NOT_CONFIGURED) {
      // EC-7: the skeleton itself says why it is not model-written.
      skeleton.meta.degraded_reason = REASON_MODEL_NOT_CONFIGURED;
    } else {
      setFailure(skeleton.meta, message, at);
    }
    await this.storeSkeleton(workspaceId, repoId, skeleton);
  }

  /** An unexpected error keeps the previous tour and records why in its meta. */
  private async recordFailure(workspaceId: string, repoId: string): Promise<void> {
    const existing = await this.storedTour(workspaceId, repoId);
    if (!existing) return;
    setFailure(existing.tour.meta, GENERATE_FAILED_MESSAGE, new Date());
    await this.repo.upsert(workspaceId, repoId, existing.tour, existing.row.generatedAt);
  }

  /** Gather the deterministic facts. Every source degrades to empty; none throws. */
  private async collectFacts(
    repo: TourRepoRow,
    cloned: boolean,
    opts: Partial<GenerateOptions>,
  ): Promise<TourFacts> {
    const intel = this.container.repoIntel;
    const state = await intel.getIndexState(repo.id).catch(() => null);

    let ranked: RankedFile[] = [];
    let chains: string[][] = [];
    if (state && !state.degraded && state.status !== 'failed') {
      ranked = await intel.getTopRanked(repo.id, RANKED_FILES_LIMIT).catch(() => []);
      chains = await intel.getCriticalPaths(repo.id).catch(() => []);
    }

    // Activity mode (AC-26): history counts feed hotness for the TOUR only.
    let mode: TourFacts['mode'] = 'import_graph';
    let windowDays: number | null = null;
    let rankingFallback: string | null = null;
    if (opts.mode === 'activity' && cloned && ranked.length > 0) {
      const days = opts.window_days ?? DEFAULT_WINDOW_DAYS;
      try {
        const counts = await withTimeout(
          this.container.git.historyCounts({ owner: repo.owner, name: repo.name }, days),
          this.opts.historyTimeoutMs ?? HISTORY_BUDGET_MS,
        );
        ranked = applyHotness(ranked, counts);
        mode = 'activity';
        windowDays = days;
      } catch {
        rankingFallback = FALLBACK_ACTIVITY_UNAVAILABLE; // EC-9: fall back to import graph
      }
    }

    const scan = cloned ? await scanClone(repo.clonePath!).catch(() => null) : null;

    let degradedReason: string | null = null;
    if (!cloned) degradedReason = REASON_NOT_CLONED;
    else if (!state) degradedReason = REASON_INDEX_UNAVAILABLE;
    else if (state.degraded || state.status === 'failed') {
      degradedReason = REASON_BY_INDEX[state.degradedReason ?? 'no_data'] ?? REASON_NO_INDEX;
    }

    return {
      ranked,
      chains,
      manifests: scan?.manifests ?? [],
      packageManager: scan?.packageManager ?? 'npm',
      hasReadme: scan?.hasReadme ?? false,
      degradedReason,
      indexSha: state?.lastIndexedSha || null,
      mode,
      windowDays,
      rankingFallback,
    };
  }
}
