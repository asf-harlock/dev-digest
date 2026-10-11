import type {
  EvalCase,
  EvalCaseDetail,
  EvalCaseLinks,
  EvalCaseListItem,
  EvalCaseOutcome,
  EvalCompare,
  EvalDashboard,
  EvalOverview,
  EvalRunDetail,
  EvalRunSnapshot,
  EvalRunStart,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { EvalRepository } from './repository.js';
import {
  CASE_ERROR_FALLBACK,
  DASHBOARD_RECENT_RUNS_LIMIT,
  EVAL_ERROR,
  LOG,
  NOT_FOUND,
  RUNS_LIMIT,
  SPARKLINE_LIMIT,
  TREND_LIMIT,
} from './constants.js';
import {
  buildCaseMeta,
  evalError,
  expectationTypeFor,
  finalStatus,
  firstErrorReason,
  recallOf,
  slugify,
  summaryFromRow,
  toCaseListItem,
  toCaseRef,
  toErrorReason,
  toEvalCaseDto,
  toLatestResult,
  toRunDetail,
  toRunRecord,
  toTrendPoint,
  uniqueCaseName,
} from './helpers.js';
import { freezeFileDiff, rawDiffFromPrFiles } from './frozen-input.js';
import { reviewFrozenCase } from './executor.js';
import { diffLines } from './prompt-diff.js';
import { diffSkills } from './skills-diff.js';
import { errorCaseOutcome, runCost, scoreCase, scoreCommon, scoreRun } from './scoring.js';
import type { EvalLogger, FindingCaseContext, FrozenCase } from './types.js';

/**
 * SPEC-08 eval service. Orchestration only: persistence is `EvalRepository`,
 * scoring / freezing / diffing are pure modules, the per-case review is
 * `executor.ts`. Read, CRUD and scoring paths make no LLM call (NFR-1); an eval
 * run writes nothing to reviews / findings / agent_runs / agent_run_skills /
 * run_traces and never touches `pull_requests.last_reviewed_sha` (NFR-4).
 */

const FINISHED_STATUSES: readonly string[] = ['completed', 'partial'];

export class EvalService {
  private repo: EvalRepository;

  constructor(private container: Container) {
    this.repo = container.evalRepo;
  }

  // ===========================================================================
  // Case creation / CRUD
  // ===========================================================================

  /**
   * AC-2..AC-7, EC-1..EC-8. Checks run in the EC-35 order:
   * 404 → finding_undecided → agent_missing → eval_case_exists → no_patch → range_outside_diff.
   */
  async createFromFinding(workspaceId: string, findingId: string): Promise<EvalCase> {
    const ctx = await this.repo.findingContext(workspaceId, findingId);
    if (!ctx) throw new NotFoundError(NOT_FOUND.finding);

    const type = expectationTypeFor(ctx.finding.acceptedAt, ctx.finding.dismissedAt);
    if (!type) throw evalError(EVAL_ERROR.findingUndecided, 422);
    if (!ctx.agentId || !ctx.agentExists) throw evalError(EVAL_ERROR.agentMissing, 422);

    const existing = await this.repo.getCaseBySourceFinding(workspaceId, findingId);
    if (existing) throw evalError(EVAL_ERROR.caseExists, 409, { case_id: existing.id });

    const frozen = freezeFileDiff(await this.loadRawDiff(ctx), {
      file: ctx.finding.file,
      start_line: ctx.finding.startLine,
      end_line: ctx.finding.endLine,
      kind: ctx.finding.kind,
    });
    if (!frozen.ok) throw evalError(frozen.reason, 422);

    const name = uniqueCaseName(
      slugify(ctx.finding.title),
      await this.repo.caseNames(workspaceId, ctx.agentId),
    );
    const row = await this.repo.insertCase({
      workspaceId,
      agentId: ctx.agentId,
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
      sourceFindingId: findingId,
    });
    return toEvalCaseDto(row);
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

  /** AC-55 — the agent's cases, newest first, each with its result in the agent's latest finished run. */
  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseListItem[]> {
    await this.requireAgent(workspaceId, agentId);
    const [rows, latestRun] = await Promise.all([
      this.repo.listCases(workspaceId, agentId),
      this.repo.latestFinishedRunRow(workspaceId, agentId),
    ]);
    const outcomes = new Map<string, EvalCaseOutcome>(
      (latestRun?.caseResults ?? []).map((o) => [o.case_id, o]),
    );
    return rows.map((row) =>
      toCaseListItem(row, latestRun ? toLatestResult(latestRun.id, outcomes.get(row.id)) : null),
    );
  }

  /** AC-56, EC-8 — the full case plus `source` (null once the source PR is gone). */
  async getCase(workspaceId: string, id: string): Promise<EvalCaseDetail> {
    const row = await this.repo.getCase(workspaceId, id);
    if (!row) throw new NotFoundError(NOT_FOUND.case);
    const [source, latestRun] = await Promise.all([
      row.sourceFindingId
        ? this.repo.caseSource(workspaceId, row.sourceFindingId)
        : Promise.resolve(undefined),
      this.repo.latestFinishedRunRow(workspaceId, row.ownerId),
    ]);
    const outcome = latestRun?.caseResults.find((o) => o.case_id === row.id);
    return {
      ...toEvalCaseDto(row),
      source: source ? { repo_id: source.repoId, pr_number: row.inputMeta.pr_number } : null,
      latest_result: latestRun ? toLatestResult(latestRun.id, outcome) : null,
    };
  }

  /** AC-15, EC-32 — rename; a name another case already has is allowed. */
  async renameCase(workspaceId: string, id: string, name: string): Promise<EvalCase> {
    const row = await this.repo.renameCase(workspaceId, id, name);
    if (!row) throw new NotFoundError(NOT_FOUND.case);
    return toEvalCaseDto(row);
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
    const agent = await this.requireAgent(workspaceId, agentId);
    const cases = await this.repo.casesForRun(workspaceId, agentId);
    if (cases.length === 0) throw evalError(EVAL_ERROR.noEvalCases, 422);

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
    });

    const startedAt = Date.now();
    logger?.info(
      { runId, agentId, agentVersion: agent.version, cases: cases.length },
      LOG.runStarted,
    );
    void this.executeRun(workspaceId, runId, agentId, agent.version, snapshot, cases, startedAt, logger).catch(
      async (err: unknown) => {
        // Unexpected crash (e.g. DB error mid-run): never leave the run `running`.
        logger?.error({ runId, agentId, err: toErrorReason(err, CASE_ERROR_FALLBACK) }, LOG.runFailed);
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
    runId: string,
    agentId: string,
    agentVersion: number,
    snapshot: EvalRunSnapshot,
    cases: FrozenCase[],
    startedAt: number,
    logger?: EvalLogger,
  ): Promise<void> {
    const outcomes: EvalCaseOutcome[] = [];
    for (const c of cases) {
      if (!(await this.repo.isRunning(workspaceId, runId))) {
        logger?.info({ runId, agentId }, LOG.runAborted);
        return;
      }
      outcomes.push(await this.reviewCase(snapshot, c));
      if (!(await this.repo.saveProgress(workspaceId, runId, outcomes))) {
        logger?.info({ runId, agentId }, LOG.runAborted);
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
      logger?.info({ runId, agentId }, LOG.runAborted);
      return;
    }
    logger?.info(
      { runId, agentId, agentVersion, cases: cases.length, status, durationMs },
      LOG.runFinished,
    );
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
    const agent = await this.container.agentsRepo.getById(workspaceId, row.agentId);
    return toRunDetail(row, agent?.name ?? null);
  }

  /** AC-57 */
  async overview(workspaceId: string, agentId: string): Promise<EvalOverview> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const [casesTotal, finishedRuns, runningRunId, finished, runs] = await Promise.all([
      this.repo.countCases(workspaceId, agentId),
      this.repo.countFinishedRuns(workspaceId, agentId),
      this.repo.runningRunId(workspaceId, agentId),
      this.repo.listRunSummaries(workspaceId, agentId, { finishedOnly: true, limit: TREND_LIMIT }),
      this.repo.listRunSummaries(workspaceId, agentId, { finishedOnly: false, limit: RUNS_LIMIT }),
    ]);
    const [latest, previous] = finished;
    return {
      agent: { id: agent.id, name: agent.name, model: agent.model, enabled: agent.enabled },
      cases_total: casesTotal,
      finished_runs: finishedRuns,
      running_run_id: runningRunId,
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
    if (!rowA || !rowB) throw new NotFoundError(NOT_FOUND.run);
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

  private async requireAgent(workspaceId: string, agentId: string) {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError(NOT_FOUND.agent);
    return agent;
  }
}
