import PQueue from 'p-queue';
import type { MultiAgentEstimates, MultiAgentRun } from '@devdigest/shared';
import type { Container } from '../../../platform/container.js';
import { ConflictError, NotFoundError } from '../../../platform/errors.js';
import type { AgentRow } from '../../../db/rows.js';
import { ReviewRepository } from '../repository.js';
import { ReviewRunExecutor, type Logger } from '../run-executor.js';
import { ESTIMATE_RUN_WINDOW, MULTI_AGENT_CONCURRENCY } from '../constants.js';
import { estimateFor } from './estimates.js';
import { buildMultiAgentRun } from './snapshot.js';

/**
 * Multi-agent review service (specs/11-multi-agent-review.md). Starts N agents
 * on one PR as one grouped run, and reads the grouped result back. Execution
 * of each agent is the unchanged `ReviewRunExecutor`; this class only fans out
 * (AC-14, AC-15) and assembles the read model (AC-16, AC-17, AC-5).
 */
export class MultiAgentService {
  private repo: ReviewRepository;
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.executor = new ReviewRunExecutor(container, this.repo, container.agentsRepo);
  }

  /**
   * Validate, create the group + its `running` children in one transaction
   * (AC-13), return the snapshot at once, and run every agent in the background
   * through a p-queue (AC-14). Nothing is written before every check passed
   * (EC-3, EC-5).
   */
  async startRun(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger?: Logger,
  ): Promise<MultiAgentRun> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // EC-4: the same agent twice is one run.
    const uniqueIds = [...new Set(agentIds)];
    const agents: AgentRow[] = [];
    for (const id of uniqueIds) {
      const agent = await this.container.agentsRepo.getById(workspaceId, id);
      if (!agent) throw new NotFoundError('Agent not found'); // EC-3 — before any write
      agents.push(agent);
    }

    // EC-5: no `details` — the client branches on the status code.
    if (await this.repo.hasRunningMultiAgentChild(workspaceId, prId)) {
      throw new ConflictError('This pull request already has a multi-agent run in progress');
    }

    const { runs } = await this.repo.createMultiAgentRun({
      workspaceId,
      prId,
      agents: agents.map((a) => ({ agentId: a.id, provider: a.provider, model: a.model })),
    });

    const agentById = new Map(agents.map((a) => [a.id, a]));
    const queue = new PQueue({ concurrency: MULTI_AGENT_CONCURRENCY });
    for (const { runId, agentId } of runs) {
      const agent = agentById.get(agentId)!;
      // One task per agent so a crash in one never touches the others.
      void queue
        .add(() => this.executor.executeRuns(workspaceId, pull, repo, [{ agent, runId }], logger))
        .catch((err) => this.failCrashedRun(runId, prId, err as Error, logger));
    }

    return this.getLatest(workspaceId, prId);
  }

  /** The PR's latest multi-agent run as a snapshot; 404 when none, or all children were deleted (EC-16). */
  async getLatest(workspaceId: string, prId: string): Promise<MultiAgentRun> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.latestMultiAgentRun(workspaceId, prId);
    if (!rows || rows.children.length === 0) throw new NotFoundError('No multi-agent run for this pull request');
    return buildMultiAgentRun(rows, Date.now());
  }

  /** One estimate per agent of the workspace; no `done` run → null fields and `runs_used: 0` (AC-5, EC-6). */
  async estimates(workspaceId: string): Promise<MultiAgentEstimates> {
    const [agents, samples] = await Promise.all([
      this.container.agentsRepo.list(workspaceId),
      this.repo.lastDoneRunsPerAgent(workspaceId, ESTIMATE_RUN_WINDOW),
    ]);
    const byAgent = new Map<string, { durationMs: number | null; costUsd: number | null }[]>();
    for (const s of samples) {
      const list = byAgent.get(s.agentId);
      if (list) list.push(s);
      else byAgent.set(s.agentId, [s]);
    }
    return { agents: agents.map((a) => estimateFor(a.id, byAgent.get(a.id) ?? [])) };
  }

  /**
   * `executeRuns` isolates per-agent failures itself; this is the net under it
   * for a crash that escaped, so the column ends `failed` rather than `running`
   * forever (which would also block the PR with a 409).
   */
  private async failCrashedRun(runId: string, prId: string, err: Error, logger?: Logger): Promise<void> {
    logger?.error({ prId, runId, err: err.message }, 'multi-agent: agent run crashed');
    await this.repo
      .completeAgentRun(runId, {
        status: 'failed',
        durationMs: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: null,
        findingsCount: 0,
        grounding: '0/0 passed',
        error: err.message,
      })
      .catch(() => undefined);
    this.container.runBus.complete(runId);
  }
}
