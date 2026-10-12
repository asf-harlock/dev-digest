import type {
  EvalCase,
  EvalCaseDetail,
  EvalCaseDraft,
  EvalCaseInput,
  EvalCaseLinks,
  EvalCaseListItem,
  EvalCaseUpdate,
  EvalCaseOutcome,
  EvalCompare,
  EvalDashboard,
  EvalFindingSkills,
  EvalOverview,
  EvalRunDetail,
  EvalRunSnapshot,
  EvalRunStart,
  EvalSkillCaseListItem,
  EvalSkillOverview,
  EvalSkillRunSnapshot,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import type { CaseOwner, EvalCaseRow, EvalRepository } from './repository.js';
import {
  CARRIER_REQUIRED_MESSAGE,
  CASE_ERROR_FALLBACK,
  DASHBOARD_RECENT_RUNS_LIMIT,
  EMPTY_UPDATE_MESSAGE,
  EVAL_ERROR,
  LOG,
  NOT_FOUND,
  RUN_SCOPE,
  RUNS_LIMIT,
  SPARKLINE_LIMIT,
  TREND_LIMIT,
} from './constants.js';
import {
  armSnapshot,
  buildCaseMeta,
  buildFindingInputMeta,
  buildSkillRunSnapshot,
  buildManualMeta,
  classifyEdit,
  effectiveExpectation,
  evalError,
  expectationTypeFor,
  finalStatus,
  firstErrorReason,
  hasUpdateFields,
  isAgentRunRow,
  isSkillRunRow,
  recallOf,
  resolveExpectationTitle,
  slugify,
  sourceOutcomes,
  summaryFromRow,
  toCaseListItem,
  toCaseRef,
  toDraftOwners,
  toErrorReason,
  toEvalCaseDraft,
  toEvalCaseDto,
  toFrozenCase,
  toLatestResult,
  toRunDetail,
  toRunRecord,
  toRunningCaseRun,
  toSkillCarrier,
  toSkillCaseListItem,
  toSkillDetailLatest,
  toSkillListLatest,
  toSkillRunDetail,
  toSkillRunRecord,
  toSkillTrendPoint,
  toTrendPoint,
  uniqueCaseName,
} from './helpers.js';
import { freezeFileDiff, rawDiffFromPrFiles } from './frozen-input.js';
import { exceedsDiffLimit, freezePastedDiff } from './pasted-diff.js';
import { reviewFrozenCase } from './executor.js';
import { diffLines } from './prompt-diff.js';
import { diffSkills } from './skills-diff.js';
import { buildArms, computeLift, pairArms, skillRunCost } from './arms.js';
import { errorCaseOutcome, runCost, scoreCase, scoreCommon, scoreRun } from './scoring.js';
import type { EvalLogger, FindingCaseContext, FrozenCase, RunTarget } from './types.js';

/**
 * SPEC-08 eval service. Orchestration only: persistence is `EvalRepository`,
 * scoring / freezing / diffing are pure modules, the per-case review is
 * `executor.ts`. Read, CRUD and scoring paths make no LLM call (NFR-1); an eval
 * run writes nothing to reviews / findings / agent_runs / agent_run_skills /
 * run_traces and never touches `pull_requests.last_reviewed_sha` (NFR-4).
 */

const FINISHED_STATUSES: readonly string[] = ['completed', 'partial'];

/** The ids every run log line carries (NFR-12): never any content. `caseId` only on a case run. */
interface AgentRunLogIds {
  runId: string;
  ownerKind: 'agent';
  agentId: string;
  agentVersion: number;
  scope: 'set' | 'case';
  caseId?: string;
  cases: number;
}

interface SkillRunLogIds {
  runId: string;
  ownerKind: 'skill';
  skillId: string;
  skillVersion: number;
  carrierAgentId: string;
  scope: 'set' | 'case';
  caseId?: string;
  cases: number;
}

export class EvalService {
  private repo: EvalRepository;

  constructor(private container: Container) {
    this.repo = container.evalRepo;
  }

  // ===========================================================================
  // Case creation / CRUD
  // ===========================================================================

  /**
   * SPEC-10 AC-1..AC-3, EC-1..EC-4, EC-29, NFR-1: the Case Editor's seed. Creates nothing and
   * makes no LLM call. Order: 404 → finding_undecided → agent_missing (no agent AND no recorded
   * skill) → no_patch / range_outside_diff (the SPEC-08 freezing rules).
   */
  async draftFromFinding(workspaceId: string, findingId: string): Promise<EvalCaseDraft> {
    const ctx = await this.repo.findingContext(workspaceId, findingId);
    if (!ctx) throw new NotFoundError(NOT_FOUND.finding);

    const type = expectationTypeFor(ctx.finding.acceptedAt, ctx.finding.dismissedAt);
    if (!type) throw evalError(EVAL_ERROR.findingUndecided, 422);

    const agent = ctx.agentId && ctx.agentExists && ctx.agentName !== null
      ? { id: ctx.agentId, name: ctx.agentName }
      : null;
    const [agentCase, recorded] = await Promise.all([
      agent
        ? this.repo.getCaseBySourceFinding(workspaceId, findingId, { kind: 'agent', id: agent.id })
        : Promise.resolve(undefined),
      this.repo.findingSkills(workspaceId, findingId),
    ]);
    const skills = recorded?.skills ?? [];
    if (!agent && skills.length === 0) throw evalError(EVAL_ERROR.agentMissing, 422);

    const frozen = freezeFileDiff(await this.loadRawDiff(ctx), {
      file: ctx.finding.file,
      start_line: ctx.finding.startLine,
      end_line: ctx.finding.endLine,
      kind: ctx.finding.kind,
    });
    if (!frozen.ok) throw evalError(frozen.reason, 422);

    const owners = toDraftOwners(agent ? { ...agent, caseId: agentCase?.id ?? null } : null, skills);
    return toEvalCaseDraft(ctx, type, frozen.diff, owners);
  }

  /**
   * AC-2..AC-7, EC-1..EC-8. Checks run in the EC-35 order:
   * 404 → finding_undecided → agent_missing → eval_case_exists → no_patch → range_outside_diff.
   * SPEC-10 AC-6..AC-8: with an `input` (the Case Editor's edited draft) the last two checks are the
   * manual-case validation of that input; without one the behaviour is unchanged.
   */
  async createFromFinding(
    workspaceId: string,
    findingId: string,
    input?: EvalCaseInput,
  ): Promise<EvalCase> {
    const ctx = await this.repo.findingContext(workspaceId, findingId);
    if (!ctx) throw new NotFoundError(NOT_FOUND.finding);

    const type = expectationTypeFor(ctx.finding.acceptedAt, ctx.finding.dismissedAt);
    if (!type) throw evalError(EVAL_ERROR.findingUndecided, 422);
    if (!ctx.agentId || !ctx.agentExists) throw evalError(EVAL_ERROR.agentMissing, 422);

    const owner: CaseOwner = { kind: 'agent', id: ctx.agentId };
    const existing = await this.repo.getCaseBySourceFinding(workspaceId, findingId, owner);
    if (existing) throw evalError(EVAL_ERROR.caseExists, 409, { case_id: existing.id });

    return toEvalCaseDto(await this.insertFindingCase(workspaceId, ctx, type, owner, input));
  }

  /**
   * SPEC-09 AC-48..AC-53, EC-35..EC-37, EC-39, EC-43, EC-44. Check order:
   * 404 (finding, skill) → finding_undecided → skill_not_in_run → an existing
   * case of that skill answers 200 → no_patch / range_outside_diff → insert 201.
   * SPEC-10 AC-6..AC-8: an `input` replaces the last two checks by the manual-case validation.
   * Makes no LLM call (NFR-1).
   */
  async createFromFindingForSkill(
    workspaceId: string,
    findingId: string,
    skillId: string,
    input?: EvalCaseInput,
  ): Promise<{ case: EvalCase; created: boolean }> {
    const ctx = await this.repo.findingContext(workspaceId, findingId);
    if (!ctx) throw new NotFoundError(NOT_FOUND.finding);
    if (!(await this.repo.skillForEval(workspaceId, skillId))) {
      throw new NotFoundError(NOT_FOUND.skill);
    }

    const type = expectationTypeFor(ctx.finding.acceptedAt, ctx.finding.dismissedAt);
    if (!type) throw evalError(EVAL_ERROR.findingUndecided, 422);

    const recorded = await this.repo.findingSkills(workspaceId, findingId);
    if (!recorded?.skills.some((s) => s.skillId === skillId)) {
      throw evalError(EVAL_ERROR.skillNotInRun, 422);
    }

    const owner: CaseOwner = { kind: 'skill', id: skillId };
    const existing = await this.repo.getCaseBySourceFinding(workspaceId, findingId, owner);
    if (existing) return { case: toEvalCaseDto(existing), created: false };

    try {
      return {
        case: toEvalCaseDto(await this.insertFindingCase(workspaceId, ctx, type, owner, input)),
        created: true,
      };
    } catch (err) {
      // Lost a race against a second request for the same skill + finding (EC-39).
      if (err instanceof AppError && err.code === EVAL_ERROR.caseExists) {
        const winner = await this.repo.getCaseBySourceFinding(workspaceId, findingId, owner);
        if (winner) return { case: toEvalCaseDto(winner), created: false };
      }
      throw err;
    }
  }

  /**
   * Freeze the finding's file diff and insert the owner's case (SPEC-08 AC-2..AC-7 rules, shared by
   * both owners). With an `input` (SPEC-10 AC-7) the case is the edited draft instead: validated and
   * frozen by the manual-case rules, still tied to the finding and to the finding's PR.
   */
  private async insertFindingCase(
    workspaceId: string,
    ctx: FindingCaseContext,
    type: NonNullable<ReturnType<typeof expectationTypeFor>>,
    owner: CaseOwner,
    input?: EvalCaseInput,
  ) {
    if (input) {
      const { diff, expectation } = this.freezeCaseInput(input, ctx.finding);
      return this.repo.insertCase({
        workspaceId,
        owner,
        name: input.name,
        inputDiff: diff,
        inputFiles: [expectation.file],
        inputMeta: buildFindingInputMeta(input.input_meta, ctx.pull, ctx.repo.fullName),
        expectation,
        sourceFindingId: ctx.finding.id,
        notes: input.notes ?? null,
      });
    }

    const frozen = freezeFileDiff(await this.loadRawDiff(ctx), {
      file: ctx.finding.file,
      start_line: ctx.finding.startLine,
      end_line: ctx.finding.endLine,
      kind: ctx.finding.kind,
    });
    if (!frozen.ok) throw evalError(frozen.reason, 422);

    const name = uniqueCaseName(
      slugify(ctx.finding.title),
      await this.repo.caseNames(workspaceId, owner),
    );
    return this.repo.insertCase({
      workspaceId,
      owner,
      name,
      inputDiff: frozen.diff,
      inputFiles: [ctx.finding.file],
      inputMeta: buildCaseMeta(ctx.pull, ctx.repo.fullName),
      expectation: {
        type,
        file: ctx.finding.file,
        start_line: ctx.finding.startLine,
        end_line: ctx.finding.endLine,
        severity: ctx.finding.severity,
        category: ctx.finding.category,
        title: ctx.finding.title,
      },
      sourceFindingId: ctx.finding.id,
    });
  }

  /**
   * The validation both manual routes and the finding routes with an `input` share (EC-1 order):
   * 204,800-byte cap → pasted-diff parsing + grounding (`no_patch` / `range_outside_diff`).
   * Returns the frozen diff and the stored expectation (severity / category null for `must_not_flag`).
   */
  private freezeCaseInput(input: EvalCaseInput, finding?: FindingCaseContext['finding']) {
    if (exceedsDiffLimit(input.input_diff)) throw evalError(EVAL_ERROR.frozenDiffTooLarge, 422);

    const exp = input.expectation;
    // A finding route keeps the finding's `kind` (full-file kinds only need the file present, as the
    // draft route grounded them) while the location is still the finding's own; an edited file or
    // line range gets the strict hunk-intersection check (SPEC-10 AC-7, EC-9).
    const sameLocation =
      finding !== undefined &&
      exp.file === finding.file &&
      exp.start_line === finding.startLine &&
      exp.end_line === finding.endLine;
    const frozen = freezePastedDiff(input.input_diff, {
      file: exp.file,
      start_line: exp.start_line,
      end_line: exp.end_line,
      ...(sameLocation ? { kind: finding.kind } : {}),
    });
    if (!frozen.ok) throw evalError(frozen.reason, 422);
    return { diff: frozen.diff, expectation: effectiveExpectation(exp, exp.title) };
  }

  /**
   * SPEC-09 AC-9, AC-10, AC-11, AC-45, AC-46, EC-1..EC-3, EC-41. Order (EC-1):
   * 404 owner → 204,800-byte cap → pasted-diff parsing + grounding → insert.
   */
  async createManualCase(
    workspaceId: string,
    owner: CaseOwner,
    input: EvalCaseInput,
  ): Promise<EvalCase> {
    await this.requireOwner(workspaceId, owner);
    const { diff, expectation } = this.freezeCaseInput(input);

    const row = await this.repo.insertCase({
      workspaceId,
      owner,
      name: input.name,
      inputDiff: diff,
      inputFiles: [expectation.file],
      inputMeta: buildManualMeta(input.input_meta),
      expectation,
      sourceFindingId: null,
      notes: input.notes ?? null,
    });
    return toEvalCaseDto(row);
  }

  /** AC-54, AC-40, SPEC-10 AC-46 — the skill's cases, newest first, each with its newest result (a set run or a case run). */
  async listSkillCases(workspaceId: string, skillId: string): Promise<EvalSkillCaseListItem[]> {
    const owner: CaseOwner = { kind: 'skill', id: skillId };
    await this.requireOwner(workspaceId, owner);
    const rows = await this.repo.listCases(workspaceId, owner);
    const latest = await this.repo.latestResultsByCase(
      workspaceId,
      owner,
      rows.map((r) => r.id),
    );
    return rows.map((row) => {
      const source = latest.get(row.id);
      if (!source) return toSkillCaseListItem(row, null);
      const arms = sourceOutcomes(row, source, true);
      return toSkillCaseListItem(row, toSkillListLatest(source.runId, arms.with, arms.without));
    });
  }

  /** AC-53 — skills recorded for the run that produced the finding's review, in run order. */
  async listFindingSkills(workspaceId: string, findingId: string): Promise<EvalFindingSkills> {
    const recorded = await this.repo.findingSkills(workspaceId, findingId);
    if (!recorded) throw new NotFoundError(NOT_FOUND.finding);
    return {
      skills: recorded.skills.map((s) => ({
        skill_id: s.skillId,
        name: s.name,
        has_case: s.caseId !== null,
        case_id: s.caseId,
      })),
    };
  }

  /** The PR's raw diff at creation time: real `git diff` first, persisted `pr_files` patches as fallback. */
  private async loadRawDiff(ctx: FindingCaseContext): Promise<string> {
    try {
      const diff = await this.container.git.diff(
        { owner: ctx.repo.owner, name: ctx.repo.name },
        ctx.pull.base,
        ctx.pull.headSha,
      );
      if (diff.files.length > 0) return diff.raw;
    } catch {
      /* fall through to the persisted patches */
    }
    return rawDiffFromPrFiles(await this.repo.prFiles(ctx.pull.id));
  }

  /** AC-55, SPEC-10 AC-46 — the agent's cases, newest first, each with its newest result (a set run or a case run). */
  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseListItem[]> {
    await this.requireAgent(workspaceId, agentId);
    const owner: CaseOwner = { kind: 'agent', id: agentId };
    const rows = await this.repo.listCases(workspaceId, owner);
    const latest = await this.repo.latestResultsByCase(
      workspaceId,
      owner,
      rows.map((r) => r.id),
    );
    return rows.map((row) => {
      const source = latest.get(row.id);
      return toCaseListItem(
        row,
        source ? toLatestResult(source.runId, sourceOutcomes(row, source, false).with) : null,
      );
    });
  }

  /** AC-56, EC-8 — the full case plus `source` (null once the source PR is gone). */
  async getCase(workspaceId: string, id: string): Promise<EvalCaseDetail> {
    const row = await this.repo.getCase(workspaceId, id);
    if (!row) throw new NotFoundError(NOT_FOUND.case);
    const [source, latest] = await Promise.all([
      row.sourceFindingId
        ? this.repo.caseSource(workspaceId, row.sourceFindingId)
        : Promise.resolve(undefined),
      this.latestResultOf(workspaceId, row),
    ]);
    return {
      ...toEvalCaseDto(row),
      // A manual case has no source finding, hence no source PR (and a null `pr_number`).
      source: source ? { repo_id: source.repoId, pr_number: row.inputMeta.pr_number ?? null } : null,
      latest_result: latest,
    };
  }

  /**
   * The case's newest result (SPEC-10 AC-46): its owner's newest finished set run or its newest case
   * run, whichever started later. Agent: that run's outcome. Skill (AC-59): the with-skill arm's
   * state and counts, duration and cost over both arms.
   */
  private async latestResultOf(workspaceId: string, row: EvalCaseRow) {
    const owner: CaseOwner = { kind: row.ownerKind, id: row.ownerId };
    const source = (await this.repo.latestResultsByCase(workspaceId, owner, [row.id])).get(row.id);
    if (!source) return null;
    if (row.ownerKind === 'skill') {
      const arms = sourceOutcomes(row, source, true);
      return toSkillDetailLatest(source.runId, arms.with, arms.without);
    }
    return toLatestResult(source.runId, sourceOutcomes(row, source, false).with);
  }

  /**
   * SPEC-09 AC-14, AC-15, AC-47, EC-1, EC-6, EC-41 (edit rule B). Order: 404 →
   * empty body (422 validation_error) → byte cap → classify (`locked` →
   * 422 case_input_locked) → in place, or replace in one transaction.
   * A rename `{ name }` is the in-place case. A name another case has is allowed.
   */
  async updateCase(workspaceId: string, id: string, update: EvalCaseUpdate): Promise<EvalCase> {
    const row = await this.repo.getCase(workspaceId, id);
    if (!row) throw new NotFoundError(NOT_FOUND.case);
    if (!hasUpdateFields(update)) throw new ValidationError(EMPTY_UPDATE_MESSAGE);
    if (update.input_diff !== undefined && exceedsDiffLimit(update.input_diff)) {
      throw evalError(EVAL_ERROR.frozenDiffTooLarge, 422);
    }

    const kind = classifyEdit(row, update);
    if (kind === 'locked') throw evalError(EVAL_ERROR.caseInputLocked, 422, { case_id: id });

    const stored = row.expectedOutput;
    if (kind === 'in_place') {
      // A finding-derived case keeps its stored expectation: only name / notes can differ here.
      const expectation =
        update.expectation && !row.sourceFindingId
          ? effectiveExpectation(
              update.expectation,
              resolveExpectationTitle(update.expectation.title, stored.title),
            )
          : undefined;
      const updated = await this.repo.updateCaseInPlace(workspaceId, id, {
        name: update.name,
        notes: update.notes,
        expectation,
      });
      if (!updated) throw new NotFoundError(NOT_FOUND.case);
      return toEvalCaseDto(updated, null);
    }

    // Replace: every field not in the body keeps its stored value.
    const exp = effectiveExpectation(
      update.expectation ?? stored,
      resolveExpectationTitle(update.expectation?.title, stored.title),
    );
    const frozen = freezePastedDiff(update.input_diff ?? row.inputDiff, {
      file: exp.file,
      start_line: exp.start_line,
      end_line: exp.end_line,
    });
    if (!frozen.ok) throw evalError(frozen.reason, 422);

    const replacement = await this.repo.replaceCase(workspaceId, id, {
      workspaceId,
      owner: { kind: row.ownerKind, id: row.ownerId },
      name: update.name ?? row.name,
      inputDiff: frozen.diff,
      inputFiles: [exp.file],
      inputMeta: update.input_meta ? buildManualMeta(update.input_meta) : row.inputMeta,
      expectation: exp,
      sourceFindingId: null,
      notes: update.notes !== undefined ? update.notes : row.notes,
      createdAt: row.createdAt,
    });
    return toEvalCaseDto(replacement, id);
  }

  /** AC-17/18 — past runs keep their own `case_set` / `case_results`, so they are untouched. */
  async deleteCase(workspaceId: string, id: string): Promise<void> {
    const ok = await this.repo.deleteCase(workspaceId, id);
    if (!ok) throw new NotFoundError(NOT_FOUND.case);
  }

  /** AC-61 */
  async caseLinks(workspaceId: string, pullId: string): Promise<EvalCaseLinks> {
    if (!(await this.repo.pullExists(workspaceId, pullId))) {
      throw new NotFoundError(NOT_FOUND.pull);
    }
    const links = await this.repo.caseLinks(workspaceId, pullId);
    return {
      links: links.map((l) => ({
        finding_id: l.findingId,
        case_id: l.caseId,
        agent_id: l.agentId,
      })),
    };
  }

  // ===========================================================================
  // Running the set
  // ===========================================================================

  /**
   * AC-19..AC-22. Snapshots the agent, reads every case's frozen input ONCE
   * (EC-17/EC-18), inserts the `running` row (single-flight, EC-10/EC-37) and
   * returns; the cases are reviewed by a detached promise — not the JobRunner,
   * whose 120 s timeout and retries do not fit a multi-case run.
   */
  async startRun(
    workspaceId: string,
    agentId: string,
    logger?: EvalLogger,
  ): Promise<EvalRunStart> {
    return this.launchAgentRun(workspaceId, agentId, { scope: RUN_SCOPE.set }, logger);
  }

  /**
   * SPEC-10 AC-35..AC-38, EC-18..EC-22, EC-26, EC-30. Starts a run of ONE case on the very same
   * executor as the set run (`launchAgentRun` / `launchSkillRun` with `scope: 'case'` and a one-case
   * `case_set`) - there is no second run path. 404 case → (agent-owned) the `startRun` checks, or
   * (skill-owned) 422 when no carrier is named, then the `startSkillRun` checks (404 carrier, 422
   * `no_agent_linked`). The 202 returns before any review; a second start of the owner - a set run
   * or a case run - is a 409 `eval_run_in_progress` with `details.run_id`. A disabled owner still runs.
   */
  async startCaseRun(
    workspaceId: string,
    caseId: string,
    carrierAgentId: string | undefined,
    logger?: EvalLogger,
  ): Promise<EvalRunStart> {
    const row = await this.repo.getCase(workspaceId, caseId);
    if (!row) throw new NotFoundError(NOT_FOUND.case);
    // EC-26: the frozen input is read here, once; later edits, replacement or deletion do not reach the run.
    const target: RunTarget = { scope: RUN_SCOPE.case, frozen: toFrozenCase(row) };
    if (row.ownerKind === 'agent') {
      return this.launchAgentRun(workspaceId, row.ownerId, target, logger);
    }
    if (!carrierAgentId) throw new ValidationError(CARRIER_REQUIRED_MESSAGE);
    return this.launchSkillRun(workspaceId, row.ownerId, carrierAgentId, target, logger);
  }

  /** The cases a run reviews: the owner's whole set read now, or the one frozen case of a case run. */
  private async casesOf(
    workspaceId: string,
    owner: CaseOwner,
    target: RunTarget,
  ): Promise<FrozenCase[]> {
    const cases =
      target.scope === RUN_SCOPE.case
        ? [target.frozen]
        : await this.repo.casesForRun(workspaceId, owner);
    if (cases.length === 0) throw evalError(EVAL_ERROR.noEvalCases, 422);
    return cases;
  }

  private async launchAgentRun(
    workspaceId: string,
    agentId: string,
    target: RunTarget,
    logger?: EvalLogger,
  ): Promise<EvalRunStart> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const cases = await this.casesOf(workspaceId, { kind: 'agent', id: agentId }, target);

    const skills = await this.container.agentsRepo.enabledSkillsForPrompt(agent.id);
    const snapshot: EvalRunSnapshot = {
      provider: agent.provider,
      model: agent.model,
      strategy: agent.strategy,
      system_prompt: agent.systemPrompt,
      skills: skills.map((s) => ({ name: s.name, body: s.body })),
    };

    const runId = await this.repo.insertRun({
      workspaceId,
      agentId,
      agentVersion: agent.version,
      snapshot,
      caseSet: cases.map(toCaseRef),
      scope: target.scope,
    });

    const startedAt = Date.now();
    // NFR-12: ids, scope and counts only - never a diff, PR text, prompt, expectation or finding text.
    const logIds: AgentRunLogIds = {
      runId,
      ownerKind: 'agent',
      agentId,
      agentVersion: agent.version,
      scope: target.scope,
      ...(target.scope === RUN_SCOPE.case ? { caseId: target.frozen.id } : {}),
      cases: cases.length,
    };
    logger?.info(logIds, LOG.runStarted);
    void this.executeRun(workspaceId, logIds, snapshot, cases, startedAt, logger).catch(
      async (err: unknown) => {
        // Unexpected crash (e.g. DB error mid-run): never leave the run `running`.
        logger?.error({ ...logIds, err: toErrorReason(err, CASE_ERROR_FALLBACK) }, LOG.runFailed);
        await this.repo
          .finalizeRun(workspaceId, runId, {
            status: 'errored',
            metrics: null,
            casesErrored: 0,
            durationMs: Date.now() - startedAt,
            costUsd: null,
            errorReason: toErrorReason(err, CASE_ERROR_FALLBACK),
          })
          .catch(() => undefined);
      },
    );
    return { id: runId, status: 'running' };
  }

  /** One case at a time (AC-22). Stops quietly when the run row is gone (agent deleted, EC-33). */
  private async executeRun(
    workspaceId: string,
    ids: AgentRunLogIds,
    snapshot: EvalRunSnapshot,
    cases: FrozenCase[],
    startedAt: number,
    logger?: EvalLogger,
  ): Promise<void> {
    const { runId } = ids;
    const outcomes: EvalCaseOutcome[] = [];
    for (const c of cases) {
      if (!(await this.repo.isRunning(workspaceId, runId))) {
        logger?.info(ids, LOG.runAborted);
        return;
      }
      outcomes.push(await this.reviewCase(snapshot, c));
      if (!(await this.repo.saveProgress(workspaceId, runId, outcomes))) {
        logger?.info(ids, LOG.runAborted);
        return;
      }
    }

    const metrics = scoreRun(outcomes);
    const status = finalStatus(metrics);
    const durationMs = Date.now() - startedAt;
    const finalized = await this.repo.finalizeRun(workspaceId, runId, {
      status,
      // EC-13: all cases errored → no metrics at all.
      metrics: status === 'errored' ? null : metrics,
      casesErrored: metrics.cases_errored,
      durationMs,
      costUsd: runCost(outcomes),
      errorReason: status === 'errored' ? firstErrorReason(outcomes) : null,
    });
    if (!finalized) {
      logger?.info(ids, LOG.runAborted);
      return;
    }
    logger?.info({ ...ids, status, durationMs }, LOG.runFinished);
  }

  /** Review + score one case; any failure becomes an `errored` outcome (EC-12). */
  private async reviewCase(snapshot: EvalRunSnapshot, c: FrozenCase): Promise<EvalCaseOutcome> {
    const started = Date.now();
    try {
      const llm = await this.container.llm(snapshot.provider);
      const result = await reviewFrozenCase(snapshot, c, llm);
      return scoreCase({
        caseId: c.id,
        name: c.name,
        expectation: c.expectation,
        findings: result.findings,
        groundingKept: result.groundingKept,
        groundingTotal: result.groundingTotal,
        durationMs: result.durationMs,
        costUsd: result.costUsd,
      });
    } catch (err) {
      return errorCaseOutcome(
        c.id,
        c.name,
        c.expectation.type,
        toErrorReason(err, CASE_ERROR_FALLBACK),
        Date.now() - started,
      );
    }
  }

  // ===========================================================================
  // Running a skill's set (SPEC-09): carrier agent, two arms per case
  // ===========================================================================

  /**
   * AC-20..AC-26, EC-11..EC-14. Order: 404 skill → 404 carrier → 422
   * `no_agent_linked` (no agent linked, or the carrier is not linked) → 422
   * `no_eval_cases` → insert (409 `eval_run_in_progress` + `details.run_id`).
   * Snapshots the skill and the carrier, builds both arms' skill lists and reads
   * every case ONCE; the 202 returns before any review (the run is detached).
   */
  async startSkillRun(
    workspaceId: string,
    skillId: string,
    carrierAgentId: string,
    logger?: EvalLogger,
  ): Promise<EvalRunStart> {
    return this.launchSkillRun(workspaceId, skillId, carrierAgentId, { scope: RUN_SCOPE.set }, logger);
  }

  private async launchSkillRun(
    workspaceId: string,
    skillId: string,
    carrierAgentId: string,
    target: RunTarget,
    logger?: EvalLogger,
  ): Promise<EvalRunStart> {
    const skill = await this.repo.skillForRun(workspaceId, skillId);
    if (!skill) throw new NotFoundError(NOT_FOUND.skill);
    const carrier = await this.requireAgent(workspaceId, carrierAgentId);

    const carriers = await this.repo.carriersForSkill(workspaceId, skillId);
    if (!carriers.some((c) => c.agentId === carrier.id)) {
      throw evalError(EVAL_ERROR.noAgentLinked, 422);
    }
    const cases = await this.casesOf(workspaceId, { kind: 'skill', id: skillId }, target);

    const links = await this.repo.carrierLinks(workspaceId, carrier.id);
    const linkOrder = links.find((l) => l.skillId === skillId)?.order ?? null;
    const { withArm, withoutArm } = buildArms(links, skill, linkOrder);
    const skillSnapshot = buildSkillRunSnapshot({
      carrier,
      skill,
      withSkills: withArm,
      withoutSkills: withoutArm,
    });

    const runId = await this.repo.insertSkillRun({
      workspaceId,
      skillId,
      skillVersion: skill.version,
      carrier: {
        agentId: carrier.id,
        name: carrier.name,
        version: carrier.version,
        model: carrier.model,
      },
      snapshot: armSnapshot(skillSnapshot, 'with'),
      skillSnapshot,
      caseSet: cases.map(toCaseRef),
      scope: target.scope,
    });

    const startedAt = Date.now();
    const logIds: SkillRunLogIds = {
      runId,
      ownerKind: 'skill',
      skillId,
      skillVersion: skill.version,
      carrierAgentId: carrier.id,
      scope: target.scope,
      ...(target.scope === RUN_SCOPE.case ? { caseId: target.frozen.id } : {}),
      cases: cases.length,
    };
    logger?.info(logIds, LOG.skillRunStarted);
    void this.executeSkillRun(workspaceId, logIds, skillSnapshot, cases, startedAt, logger).catch(
      async (err: unknown) => {
        // Unexpected crash (e.g. DB error mid-run): never leave the run `running`.
        const reason = toErrorReason(err, CASE_ERROR_FALLBACK);
        logger?.error({ ...logIds, err: reason }, LOG.skillRunFailed);
        await this.repo
          .finalizeSkillRun(workspaceId, runId, {
            status: 'errored',
            withMetrics: null,
            withoutMetrics: null,
            lift: null,
            casesErrored: 0,
            durationMs: Date.now() - startedAt,
            costUsd: null,
            errorReason: reason,
          })
          .catch(() => undefined);
      },
    );
    return { id: runId, status: 'running' };
  }

  /**
   * One review at a time, with-skill arm then without-skill arm of each case, both
   * through `reviewCase` → `reviewFrozenCase` (so the prompts differ only by the
   * skill block, AC-27). `isRunning` is checked before EACH review: a deleted
   * skill takes its run with it, and the executor stops with no further LLM call,
   * no write and no error log (EC-24). Progress is saved per case.
   */
  private async executeSkillRun(
    workspaceId: string,
    ids: SkillRunLogIds,
    snapshot: EvalSkillRunSnapshot,
    cases: FrozenCase[],
    startedAt: number,
    logger?: EvalLogger,
  ): Promise<void> {
    const { runId } = ids;
    const withSnapshot = armSnapshot(snapshot, 'with');
    const withoutSnapshot = armSnapshot(snapshot, 'without');
    const withOutcomes: EvalCaseOutcome[] = [];
    const withoutOutcomes: EvalCaseOutcome[] = [];

    for (const c of cases) {
      if (!(await this.repo.isRunning(workspaceId, runId))) {
        logger?.info(ids, LOG.skillRunAborted);
        return;
      }
      const withOutcome = await this.reviewCase(withSnapshot, c);
      if (!(await this.repo.isRunning(workspaceId, runId))) {
        logger?.info(ids, LOG.skillRunAborted);
        return;
      }
      const withoutOutcome = await this.reviewCase(withoutSnapshot, c);
      withOutcomes.push(withOutcome);
      withoutOutcomes.push(withoutOutcome);
      if (!(await this.repo.saveSkillProgress(workspaceId, runId, withOutcomes, withoutOutcomes))) {
        logger?.info(ids, LOG.skillRunAborted);
        return;
      }
    }

    // EC-16: a case errored in either arm is errored in both and leaves every metric and lift.
    const paired = pairArms(withOutcomes, withoutOutcomes);
    const withMetrics = scoreRun(paired.with);
    const withoutMetrics = scoreRun(paired.without);
    const status = finalStatus(withMetrics);
    const allErrored = status === 'errored';
    const durationMs = Date.now() - startedAt;
    const finalized = await this.repo.finalizeSkillRun(
      workspaceId,
      runId,
      {
        status,
        // EC-17: all cases errored → no metrics and no lifts at all.
        withMetrics: allErrored ? null : withMetrics,
        withoutMetrics: allErrored ? null : withoutMetrics,
        lift: allErrored ? null : computeLift(withMetrics, withoutMetrics),
        casesErrored: withMetrics.cases_errored,
        durationMs,
        // EC-27: null when either arm of any scored case has no cost.
        costUsd: allErrored ? null : skillRunCost(paired.with, paired.without),
        errorReason: allErrored ? firstErrorReason(paired.with) : null,
      },
      paired,
    );
    if (!finalized) {
      logger?.info(ids, LOG.skillRunAborted);
      return;
    }
    logger?.info({ ...ids, status, durationMs }, LOG.skillRunFinished);
  }

  /** AC-41 — carriers, case count, the running run, the two newest finished runs, and the trend (<= 100). */
  async skillOverview(workspaceId: string, skillId: string): Promise<EvalSkillOverview> {
    const skill = await this.repo.skillForRun(workspaceId, skillId);
    if (!skill) throw new NotFoundError(NOT_FOUND.skill);
    const [casesTotal, runningRunId, runningCase, carriers, finished, trendRows] = await Promise.all([
      this.repo.countCases(workspaceId, { kind: 'skill', id: skillId }),
      this.repo.runningSkillRunId(workspaceId, skillId),
      this.repo.runningCaseRun(workspaceId, { kind: 'skill', id: skillId }),
      this.repo.carriersForSkill(workspaceId, skillId),
      this.repo.listSkillRunSummaries(workspaceId, skillId, 2),
      this.repo.listSkillTrendRows(workspaceId, skillId, TREND_LIMIT),
    ]);
    const [latest, previous] = finished;
    return {
      skill: { id: skill.id, name: skill.name, version: skill.version, enabled: skill.enabled },
      cases_total: casesTotal,
      running_run_id: runningRunId,
      carriers: carriers.map(toSkillCarrier),
      running_case_run: toRunningCaseRun(runningCase),
      latest: latest ? toSkillRunRecord(latest, skill.name) : null,
      previous: previous ? toSkillRunRecord(previous, skill.name) : null,
      // `trendRows` is newest-first; the chart reads chronologically.
      trend: [...trendRows].reverse().map(toSkillTrendPoint),
    };
  }

  /** EC-14 — boot reap. Returns how many runs were marked `interrupted`. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapRunning();
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  /** AC-58 */
  async getRun(workspaceId: string, id: string): Promise<EvalRunDetail> {
    const row = await this.repo.getRunRow(workspaceId, id);
    if (!row) throw new NotFoundError(NOT_FOUND.run);
    if (isSkillRunRow(row)) return toSkillRunDetail(row);
    if (!isAgentRunRow(row)) throw new NotFoundError(NOT_FOUND.run);
    const agent = await this.container.agentsRepo.getById(workspaceId, row.agentId);
    return toRunDetail(row, agent?.name ?? null);
  }

  /** AC-57 */
  async overview(workspaceId: string, agentId: string): Promise<EvalOverview> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const [casesTotal, finishedRuns, runningRunId, runningCase, finished, runs] = await Promise.all([
      this.repo.countCases(workspaceId, { kind: 'agent', id: agentId }),
      this.repo.countFinishedRuns(workspaceId, agentId),
      this.repo.runningRunId(workspaceId, agentId),
      this.repo.runningCaseRun(workspaceId, { kind: 'agent', id: agentId }),
      this.repo.listRunSummaries(workspaceId, agentId, { finishedOnly: true, limit: TREND_LIMIT }),
      this.repo.listRunSummaries(workspaceId, agentId, { finishedOnly: false, limit: RUNS_LIMIT }),
    ]);
    const [latest, previous] = finished;
    return {
      agent: { id: agent.id, name: agent.name, model: agent.model, enabled: agent.enabled },
      cases_total: casesTotal,
      finished_runs: finishedRuns,
      running_run_id: runningRunId,
      running_case_run: toRunningCaseRun(runningCase),
      latest: latest ? toRunRecord(latest, agent.name) : null,
      previous: previous ? toRunRecord(previous, agent.name) : null,
      // `finished` is newest-first; the trend reads chronologically.
      trend: [...finished].reverse().map(toTrendPoint),
      runs: runs.map((r) => toRunRecord(r, agent.name)),
    };
  }

  /** AC-59 — one summary per workspace agent (a query per agent, bounded by the agent count). */
  async dashboard(workspaceId: string): Promise<EvalDashboard> {
    const agents = (await this.container.agentsRepo.list(workspaceId)).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const names = new Map(agents.map((a) => [a.id, a.name]));
    const [caseCounts, recent, finishedPerAgent] = await Promise.all([
      this.repo.caseCountsByAgent(workspaceId),
      this.repo.recentRunSummaries(workspaceId, DASHBOARD_RECENT_RUNS_LIMIT),
      Promise.all(
        agents.map((a) =>
          this.repo.listRunSummaries(workspaceId, a.id, {
            finishedOnly: true,
            limit: SPARKLINE_LIMIT,
          }),
        ),
      ),
    ]);
    return {
      agents: agents.map((a, i) => {
        const finished = finishedPerAgent[i] ?? [];
        const latest = finished[0];
        return {
          agent_id: a.id,
          agent_name: a.name,
          model: a.model,
          enabled: a.enabled,
          cases_total: caseCounts.get(a.id) ?? 0,
          latest: latest ? toRunRecord(latest, a.name) : null,
          sparkline: [...finished].reverse().map(recallOf),
        };
      }),
      recent_runs: recent.map((r) => toRunRecord(r, names.get(r.agentId) ?? null)),
    };
  }

  /**
   * AC-45..AC-50, AC-60. Check order: 404 (either run not in the workspace) →
   * 422 runs_not_comparable (different agents) → 422 run_not_finished.
   * `old` is the run that started earlier; the server returns no deltas.
   */
  async compare(workspaceId: string, a: string, b: string): Promise<EvalCompare> {
    const [rowA, rowB] = await Promise.all([
      this.repo.getRunRow(workspaceId, a),
      this.repo.getRunRow(workspaceId, b),
    ]);
    // EC-38: a skill run is not comparable — it does not exist as far as compare is concerned.
    // SPEC-10 EC-28: neither does a single-case run.
    if (
      !rowA ||
      !rowB ||
      !isAgentRunRow(rowA) ||
      !isAgentRunRow(rowB) ||
      rowA.scope === RUN_SCOPE.case ||
      rowB.scope === RUN_SCOPE.case
    ) {
      throw new NotFoundError(NOT_FOUND.run);
    }
    if (rowA.agentId !== rowB.agentId) throw evalError(EVAL_ERROR.runsNotComparable, 422);
    for (const row of [rowA, rowB]) {
      if (!FINISHED_STATUSES.includes(row.status)) {
        throw evalError(EVAL_ERROR.runNotFinished, 422, { run_id: row.id });
      }
    }

    const aFirst =
      rowA.ranAt.getTime() !== rowB.ranAt.getTime()
        ? rowA.ranAt.getTime() < rowB.ranAt.getTime()
        : rowA.id < rowB.id;
    const [oldRow, newRow] = aFirst ? [rowA, rowB] : [rowB, rowA];

    const oldIds = new Set(oldRow.caseSet.map((c) => c.id));
    const newIds = new Set(newRow.caseSet.map((c) => c.id));
    const common = new Set([...oldIds].filter((id) => newIds.has(id)));

    const agent = await this.container.agentsRepo.getById(workspaceId, oldRow.agentId);
    const agentName = agent?.name ?? null;
    const prompt = diffLines(oldRow.snapshot.system_prompt, newRow.snapshot.system_prompt);
    const oldSnap = oldRow.snapshot;
    const newSnap = newRow.snapshot;

    return {
      old: toRunRecord(summaryFromRow(oldRow), agentName),
      new: toRunRecord(summaryFromRow(newRow), agentName),
      common_cases: common.size,
      only_old: oldIds.size - common.size,
      only_new: newIds.size - common.size,
      common: scoreCommon(oldRow.caseResults, newRow.caseResults, common),
      prompt_diff: prompt,
      prompt_changed: oldSnap.system_prompt !== newSnap.system_prompt,
      skills_diff: diffSkills(oldSnap.skills, newSnap.skills),
      model_change:
        oldSnap.model !== newSnap.model ? { from: oldSnap.model, to: newSnap.model } : null,
      strategy_change:
        oldSnap.strategy !== newSnap.strategy
          ? { from: oldSnap.strategy, to: newSnap.strategy }
          : null,
    };
  }

  // ===========================================================================

  /** 404 when the case owner (agent or skill) is not in this workspace. */
  private async requireOwner(workspaceId: string, owner: CaseOwner): Promise<void> {
    if (owner.kind === 'agent') {
      await this.requireAgent(workspaceId, owner.id);
      return;
    }
    if (!(await this.repo.skillForEval(workspaceId, owner.id))) {
      throw new NotFoundError(NOT_FOUND.skill);
    }
  }

  private async requireAgent(workspaceId: string, agentId: string) {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError(NOT_FOUND.agent);
    return agent;
  }
}
