import type {
  CiExport,
  CiExportInput,
  CiFailureReason,
  CiInstallation,
  CiPreview,
  CiPreviewFileContent,
  CiRefreshInput,
  CiRefreshResult,
  CiRun,
  CiRunsQuery,
  CiTarget,
  GitHubClient,
  RepoRef,
  WorkflowRun,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import {
  ARTIFACT_NAME,
  ARTIFACT_REJECTED,
  CI_BRANCH,
  CI_ERROR,
  COMMIT_MESSAGE,
  INGESTED_CONCLUSIONS,
  MEMORY_MAX_ROWS,
  PR_TITLE,
  REFRESH_CONCURRENCY,
  REFRESH_DEADLINE_MS,
  REFRESH_DEBOUNCE_MS,
  REFRESH_RUNS_LIMIT,
  RUNNER_DIR,
  STALE_RUN_MS,
  WORKFLOW_EVENT,
  WORKFLOW_PATH,
  WORKFLOW_VERSION,
  type IngestedConclusion,
} from './constants.js';
import { assembleExport, toCommitFiles, toPreview, type AssembledExport } from './assemble.js';
import { listRunnerFiles, readRunnerFile, readRunnerFiles } from './bundle.js';
import { ciError, githubFailure, ingestFailed, isGithubNotFound, resetAtOf } from './errors.js';
import {
  deriveRunStatus,
  deriveVerdict,
  isExpectedWorkflowRun,
  isTrustedJobUrl,
  severityBlockers,
  slugify,
} from './helpers.js';
import { checkIngestArtifact, type CheckedArtifact } from './ingest.js';
import {
  toCiInstallation,
  toCiRun,
  toManifestAgent,
  toMemoryExportRow,
  trustedPrUrl,
} from './mappers.js';
import { orderTriggers, assertValidWorkflowYaml } from './workflow.js';
import { buildPrBody } from './pr-body.js';
import {
  CiRepository,
  type CiInstallationWithAgent,
  type CiMemoryRow,
  type CiRepoRow,
  type CiSkillRow,
  type AgentRow,
} from './repository.js';
import { archiveFilename, buildZip } from './zip.js';
import type { MemoryExportRow } from './memory-export.js';

/**
 * SPEC-12 Export to CI — orchestration. Preview and export build the file set from
 * the DB and the built runner; refresh pulls the repository's own workflow runs
 * from GitHub and stores them. No SQL (repository.ts), no HTTP framework
 * (routes.ts), no LLM call (NFR-11); the GitHub token reaches no log, response,
 * file or error text (NFR-12).
 */

const GITHUB_TOKEN_KEY = 'GITHUB_TOKEN';
/** Adapter error code of an expired artifact (HTTP 410). */
const ARTIFACT_EXPIRED = 'artifact_expired';
const NOT_FOUND_AGENT = 'Agent not found';
const NOT_FOUND_REPO = 'Repository not found';
const NOT_FOUND_INSTALLATION = 'CI installation not found';
const NOT_FOUND_FILE = 'Export file not found';

/** The inputs of a preview or a runner-file read. */
export type PreviewFileQuery = Pick<CiExportInput, 'repo' | 'target' | 'post_as' | 'triggers'> & {
  path: string;
};

export interface ExportOutcome {
  /** True when a new installation row was created (HTTP 201), false for a re-publish (200). */
  created: boolean;
  body: CiExport;
}

export interface ArchiveOutcome {
  filename: string;
  bytes: Uint8Array;
}

interface ExportContext {
  agent: AgentRow;
  repo: CiRepoRow;
  skills: CiSkillRow[];
  memoryRows: MemoryExportRow[];
  memoryTotal: number;
  manifestSlug: string;
  existing: CiInstallationWithAgent | undefined;
}

interface RefreshTally {
  added: number;
  updated: number;
  skipped: number;
  /** At least one completed run of the workflow was seen (stored now or earlier). */
  sawCompleted: boolean;
}

interface RefreshOutcome {
  result: CiRefreshResult;
  /** Set when the installation's refresh failed; thrown when the request is single or all failed. */
  error?: AppError;
}

type ArtifactVerdict =
  | { ok: true; artifact: CheckedArtifact }
  | { ok: false; reason: CiFailureReason };

function repoRef(fullName: string): RepoRef {
  const slash = fullName.indexOf('/');
  return { owner: fullName.slice(0, slash), name: fullName.slice(slash + 1) };
}

function isIngestedConclusion(value: string | null): value is IngestedConclusion {
  return value !== null && (INGESTED_CONCLUSIONS as readonly string[]).includes(value);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class CiService {
  private readonly repo: CiRepository;
  /** `workspace:lower(repo)` of exports in flight (single API instance, like RunBus). */
  private readonly exportLocks = new Set<string>();
  /** `workspace:installation id` of refreshes in flight. */
  private readonly refreshLocks = new Set<string>();

  constructor(
    private readonly container: Container,
    repo?: CiRepository,
  ) {
    this.repo = repo ?? new CiRepository(container.db);
  }

  // ------------------------------------------------------------------ preview

  /** The file list and warnings of an export. Reads the DB and the runner dist; never GitHub, never writes. */
  async preview(workspaceId: string, agentId: string, input: CiExportInput): Promise<CiPreview> {
    this.assertTarget(input.target);
    const ctx = await this.loadContext(workspaceId, agentId, input.repo);
    const workflowOverride = this.checkedWorkflow(input);
    const runnerFiles = await listRunnerFiles(this.container.config.agentRunnerDist);
    return toPreview(this.assemble(ctx, input, runnerFiles, workflowOverride));
  }

  /** One file's text: a runner file is read from the dist on demand, any other from the assembled export. */
  async previewFile(
    workspaceId: string,
    agentId: string,
    query: PreviewFileQuery,
  ): Promise<CiPreviewFileContent> {
    this.assertTarget(query.target);
    const dist = this.container.config.agentRunnerDist;
    if (query.path.startsWith(`${RUNNER_DIR}/`)) {
      await this.requireAgent(workspaceId, agentId);
      const contents = await readRunnerFile(dist, query.path);
      return { path: query.path, contents, size_bytes: Buffer.byteLength(contents, 'utf8') };
    }
    const ctx = await this.loadContext(workspaceId, agentId, query.repo);
    const runnerFiles = await listRunnerFiles(dist);
    const assembled = this.assemble(
      ctx,
      { ...query, action: 'open_pr' },
      runnerFiles,
      undefined,
    );
    const file = assembled.files.find((f) => f.path === query.path);
    if (!file || file.contents === null) throw new NotFoundError(NOT_FOUND_FILE);
    return { path: file.path, contents: file.contents, size_bytes: file.size_bytes };
  }

  // ------------------------------------------------------------------- export

  /** Commit the files to `devdigest/ci`, open (or reuse) the pull request and record the installation. */
  async exportToPr(
    workspaceId: string,
    agentId: string,
    input: CiExportInput,
  ): Promise<ExportOutcome> {
    this.assertTarget(input.target);
    return this.withExportLock(workspaceId, input.repo, async () => {
      const ctx = await this.loadContext(workspaceId, agentId, input.repo);
      this.assertNotTaken(ctx);
      const workflowOverride = this.checkedWorkflow(input);
      const runnerFiles = await readRunnerFiles(this.container.config.agentRunnerDist);
      const token = await this.requireToken();

      const assembled = this.assemble(ctx, input, runnerFiles, workflowOverride);
      const files = toCommitFiles(assembled);
      const ref: RepoRef = { owner: ctx.repo.owner, name: ctx.repo.name };
      const gh = await this.container.github();

      let committed;
      try {
        committed = await gh.commitFiles(ref, {
          branch: CI_BRANCH,
          base: ctx.repo.defaultBranch,
          message: COMMIT_MESSAGE,
          files,
        });
      } catch (err) {
        throw githubFailure(err, [token]);
      }

      const prUrl = await this.openOrReusePr(gh, ref, ctx, files.length, committed.changed);

      const existing = ctx.existing?.installation;
      const saved = await this.repo.upsertInstallation({
        workspaceId,
        agentId: ctx.agent.id,
        repo: ctx.repo.fullName,
        targetType: 'gha',
        // An Update never demotes an installation that is already live or handed out as a zip.
        status: existing?.status === 'active' || existing?.status === 'manual' ? existing.status : 'pending_pr',
        prUrl,
        workflowVersion: WORKFLOW_VERSION,
        agentVersion: ctx.agent.version,
        postAs: input.post_as,
        triggers: orderTriggers(input.triggers),
        ciFailOn: ctx.agent.ciFailOn,
        manifestSlug: ctx.manifestSlug,
      });
      if (saved.kind === 'repo_taken') throw this.repoTaken(saved.installation, saved.agentName);

      return {
        created: ctx.existing === undefined,
        body: {
          installation: await this.installationDto(workspaceId, saved.installation.id),
          pr_url: prUrl,
          file_count: files.length,
        },
      };
    });
  }

  /** The zip for a manual install; the installation is recorded as `manual` (AC-16). */
  async exportArchive(
    workspaceId: string,
    agentId: string,
    input: CiExportInput,
  ): Promise<ArchiveOutcome> {
    this.assertTarget(input.target);
    return this.withExportLock(workspaceId, input.repo, async () => {
      const ctx = await this.loadContext(workspaceId, agentId, input.repo);
      this.assertNotTaken(ctx);
      const workflowOverride = this.checkedWorkflow(input);
      const runnerFiles = await readRunnerFiles(this.container.config.agentRunnerDist);

      const assembled = this.assemble(ctx, input, runnerFiles, workflowOverride);
      const bytes = buildZip(toCommitFiles(assembled));

      const existing = ctx.existing?.installation;
      const saved = await this.repo.upsertInstallation({
        workspaceId,
        agentId: ctx.agent.id,
        repo: ctx.repo.fullName,
        targetType: 'gha',
        status: existing?.status === 'active' ? 'active' : 'manual',
        prUrl: existing?.prUrl ?? null,
        workflowVersion: WORKFLOW_VERSION,
        agentVersion: ctx.agent.version,
        postAs: input.post_as,
        triggers: orderTriggers(input.triggers),
        ciFailOn: ctx.agent.ciFailOn,
        manifestSlug: ctx.manifestSlug,
      });
      if (saved.kind === 'repo_taken') throw this.repoTaken(saved.installation, saved.agentName);

      return { filename: archiveFilename(ctx.repo.name), bytes };
    });
  }

  // ------------------------------------------------------------ installations

  /** Installations of one agent (agent id given) or of the whole workspace. */
  async listInstallations(workspaceId: string, agentId?: string): Promise<CiInstallation[]> {
    let items: CiInstallationWithAgent[];
    if (agentId !== undefined) {
      await this.requireAgent(workspaceId, agentId);
      items = await this.repo.listInstallationsByAgent(workspaceId, agentId);
    } else {
      items = await this.repo.listInstallations(workspaceId);
    }
    const lastRuns = await this.repo.lastRunPerInstallation(
      workspaceId,
      items.map((i) => i.installation.id),
    );
    const byInstallation = new Map(lastRuns.map((r) => [r.installationId, r]));
    return items.map((item) => toCiInstallation(item, byInstallation.get(item.installation.id)));
  }

  // --------------------------------------------------------------------- runs

  /** Stored rows only; GitHub is never called here (AC-63). */
  async listRuns(workspaceId: string, query: CiRunsQuery): Promise<CiRun[]> {
    const rows = await this.repo.listRuns(workspaceId, {
      ...(query.repo !== undefined ? { repo: query.repo } : {}),
      ...(query.agent_id !== undefined ? { agentId: query.agent_id } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.installation_id !== undefined ? { installationId: query.installation_id } : {}),
      limit: query.limit,
    });
    return rows.map(toCiRun);
  }

  // ------------------------------------------------------------------ refresh

  /**
   * Pull the newest runs of the generated workflow for one installation (when
   * `installation_id` is given) or all of them. A failure of a single-installation
   * request — or of every installation — is thrown with its error code; partial
   * failures of a workspace-wide refresh are reported per installation.
   */
  async refresh(workspaceId: string, input: CiRefreshInput): Promise<CiRefreshResult[]> {
    let targets: CiInstallationWithAgent[];
    if (input.installation_id !== undefined) {
      const one = await this.repo.getInstallation(workspaceId, input.installation_id);
      if (!one) throw new NotFoundError(NOT_FOUND_INSTALLATION);
      targets = [one];
    } else {
      targets = await this.repo.listInstallations(workspaceId);
    }
    if (targets.length === 0) return [];

    const token = await this.requireToken();
    const gh = await this.container.github();
    const deadline = Date.now() + REFRESH_DEADLINE_MS;

    const outcomes: RefreshOutcome[] = [];
    for (const item of targets) {
      outcomes.push(await this.refreshInstallation(workspaceId, item, gh, token, input.force, deadline));
    }

    const failed = outcomes.filter((o) => o.error !== undefined);
    const first = failed[0]?.error;
    if (first && (input.installation_id !== undefined || failed.length === outcomes.length)) {
      throw first;
    }
    return outcomes.map((o) => o.result);
  }

  private async refreshInstallation(
    workspaceId: string,
    item: CiInstallationWithAgent,
    gh: GitHubClient,
    token: string,
    force: boolean,
    deadline: number,
  ): Promise<RefreshOutcome> {
    const inst = item.installation;
    const lockKey = `${workspaceId}:${inst.id}`;
    if (this.refreshLocks.has(lockKey)) {
      return this.refreshFailure(inst.id, ciError(CI_ERROR.refreshRunning));
    }
    this.refreshLocks.add(lockKey);
    try {
      return await this.runRefresh(workspaceId, item, gh, token, force, deadline);
    } catch (err) {
      // An unexpected error (a poisoned row, a DB failure) fails THIS installation only,
      // with fixed text: the others are still refreshed and no upstream text leaks.
      return this.refreshFailure(inst.id, err instanceof AppError ? err : ingestFailed());
    } finally {
      this.refreshLocks.delete(lockKey);
    }
  }

  private async runRefresh(
    workspaceId: string,
    item: CiInstallationWithAgent,
    gh: GitHubClient,
    token: string,
    force: boolean,
    deadline: number,
  ): Promise<RefreshOutcome> {
    const inst = item.installation;
    const startedAt = Date.now();
    if (!force && inst.lastRefreshedAt && startedAt - inst.lastRefreshedAt.getTime() < REFRESH_DEBOUNCE_MS) {
      return {
        result: { installation_id: inst.id, status: 'skipped', added: 0, updated: 0, skipped: 0, failure: null },
      };
    }
    if (startedAt >= deadline) return this.refreshFailure(inst.id, ciError(CI_ERROR.refreshTimeout));

    const ref = repoRef(inst.repo);
    let runs: WorkflowRun[];
    try {
      runs = await gh.listWorkflowRuns(ref, {
        workflowPath: WORKFLOW_PATH,
        event: WORKFLOW_EVENT,
        perPage: REFRESH_RUNS_LIMIT,
      });
    } catch (err) {
      const failure = githubFailure(err, [token]);
      // Before the workflow file is merged GitHub answers 404 for its runs: there are none yet.
      // A 403 (token lacks Actions access) is a failure for every status (EC-25).
      if (
        failure.code === CI_ERROR.githubPermission &&
        isGithubNotFound(failure) &&
        inst.status !== 'active'
      ) {
        runs = [];
      } else {
        return this.refreshFailure(inst.id, failure);
      }
    }

    const tally: RefreshTally = { added: 0, updated: 0, skipped: 0, sawCompleted: false };
    const queue = runs.filter((run) => {
      if (isExpectedWorkflowRun(run, inst.repo)) return true;
      tally.skipped += 1;
      return false;
    });

    let next = 0;
    let fatal: AppError | undefined;
    let timedOut = false;
    const worker = async (): Promise<void> => {
      while (fatal === undefined && !timedOut) {
        if (Date.now() >= deadline) {
          timedOut = true;
          return;
        }
        const run = queue[next++];
        if (!run) return;
        try {
          await this.ingestRun(workspaceId, item, run, gh, token, tally);
        } catch (err) {
          fatal ??= err instanceof AppError ? err : ingestFailed();
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(REFRESH_CONCURRENCY, queue.length) }, worker));

    // Rows stored before a failure stay (EC-25, EC-26); the debounce clock is not advanced.
    if (fatal !== undefined) return this.refreshFailure(inst.id, fatal, tally);
    if (timedOut) return this.refreshFailure(inst.id, ciError(CI_ERROR.refreshTimeout), tally);

    await this.repo.failStaleRunning(workspaceId, new Date(Date.now() - STALE_RUN_MS));
    if (tally.sawCompleted) await this.repo.markActiveOnFirstRun(workspaceId, inst.id);
    await this.repo.touchLastRefreshed(workspaceId, inst.id, new Date());

    return {
      result: {
        installation_id: inst.id,
        status: 'refreshed',
        added: tally.added,
        updated: tally.updated,
        skipped: tally.skipped,
        failure: null,
      },
    };
  }

  /** Store one workflow run: a `running` row while in flight, the final row (plus its `agent_runs` row) once completed. */
  private async ingestRun(
    workspaceId: string,
    item: CiInstallationWithAgent,
    run: WorkflowRun,
    gh: GitHubClient,
    token: string,
    tally: RefreshTally,
  ): Promise<void> {
    const inst = item.installation;
    const existing = await this.repo.findRunByGithubId(workspaceId, run.id, run.run_attempt);
    if (existing && existing.status !== 'running') {
      // Already stored as completed: neither a second row nor a second agent run (AC-61).
      tally.skipped += 1;
      tally.sawCompleted = true;
      return;
    }

    const runPr = run.pull_requests.length === 1 ? (run.pull_requests[0] ?? null) : null;
    const base = {
      workspaceId,
      ciInstallationId: inst.id,
      repo: inst.repo,
      agentName: item.agentName,
      ranAt: parseDate(run.run_started_at ?? run.created_at),
      githubRunId: run.id,
      runAttempt: run.run_attempt,
      headSha: run.head_sha,
      githubUrl: isTrustedJobUrl(run.html_url, inst.repo) ? run.html_url : null,
    };
    const empty = {
      verdict: null,
      failureReason: null,
      findingsCount: null,
      critical: null,
      warning: null,
      suggestion: null,
      costUsd: null,
      durationMs: null,
    } as const;

    if (run.status !== 'completed') {
      await this.repo.upsertRunning({ ...base, ...empty, prNumber: runPr, status: 'running' });
      if (existing) tally.updated += 1;
      else tally.added += 1;
      return;
    }

    const conclusion = run.conclusion;
    if (!isIngestedConclusion(conclusion)) {
      tally.skipped += 1; // `skipped` (EC-36) and every conclusion outside the spec list
      return;
    }

    let verdict: ArtifactVerdict;
    if (conclusion === 'cancelled' || conclusion === 'timed_out') {
      verdict = { ok: false, reason: conclusion };
    } else {
      verdict = await this.verifyArtifact(gh, token, run, inst.repo, runPr);
    }

    const artifactOk = verdict.ok;
    const counts = verdict.ok
      ? {
          critical: verdict.artifact.critical,
          warning: verdict.artifact.warning,
          suggestion: verdict.artifact.suggestion,
        }
      : null;
    const findingsCount = verdict.ok ? verdict.artifact.findings_count : null;
    const status = deriveRunStatus({ conclusion, artifactOk, findingsCount });
    const failureReason = verdict.ok ? null : verdict.reason;
    const blockers = counts ? severityBlockers(counts, inst.ciFailOn) : null;

    const saved = await this.repo.saveCompletedRunWithAgentRun(
      {
        ...base,
        prNumber: runPr ?? (verdict.ok ? verdict.artifact.pr_number : null),
        status,
        verdict:
          counts && findingsCount !== null
            ? deriveVerdict({ ...counts, findings_count: findingsCount }, inst.ciFailOn)
            : null,
        failureReason,
        findingsCount,
        critical: counts?.critical ?? null,
        warning: counts?.warning ?? null,
        suggestion: counts?.suggestion ?? null,
        costUsd: verdict.ok ? verdict.artifact.cost_usd : null,
        durationMs: verdict.ok ? verdict.artifact.duration_ms : null,
      },
      {
        workspaceId,
        agentId: inst.agentId,
        status: artifactOk ? 'done' : 'failed',
        ranAt: base.ranAt ?? new Date(),
        costUsd: verdict.ok ? verdict.artifact.cost_usd : null,
        durationMs: verdict.ok ? verdict.artifact.duration_ms : null,
        findingsCount,
        blockers,
        error: failureReason,
      },
    );
    tally.sawCompleted = true;
    if (!saved) {
      tally.skipped += 1;
      return;
    }
    if (existing) tally.updated += 1;
    else tally.added += 1;
  }

  /** Download and check the run's `devdigest-result` artifact. Rate-limit and permission failures propagate. */
  private async verifyArtifact(
    gh: GitHubClient,
    token: string,
    run: WorkflowRun,
    installationRepo: string,
    runPr: number | null,
  ): Promise<ArtifactVerdict> {
    const ref = repoRef(installationRepo);
    let artifacts;
    try {
      artifacts = await gh.listRunArtifacts(ref, run.id);
    } catch (err) {
      throw githubFailure(err, [token]);
    }
    const named = artifacts.filter((a) => a.name === ARTIFACT_NAME);
    if (named.length === 0) return { ok: false, reason: 'no_artifact' };
    const usable = named.find((a) => !a.expired);
    if (!usable) return { ok: false, reason: ARTIFACT_EXPIRED };

    let zipBytes: Uint8Array;
    try {
      zipBytes = await gh.downloadArtifact(ref, usable.id);
    } catch (err) {
      if (err instanceof AppError && err.code === ARTIFACT_EXPIRED) {
        return { ok: false, reason: ARTIFACT_EXPIRED };
      }
      if (err instanceof AppError && err.code === ARTIFACT_REJECTED) {
        return { ok: false, reason: ARTIFACT_REJECTED };
      }
      throw githubFailure(err, [token]);
    }

    const checked = checkIngestArtifact({
      zipBytes,
      headSha: run.head_sha,
      installationRepo,
      installationPrNumber: runPr,
    });
    return checked.ok ? { ok: true, artifact: checked.artifact } : { ok: false, reason: ARTIFACT_REJECTED };
  }

  private refreshFailure(
    installationId: string,
    error: AppError,
    tally: Omit<RefreshTally, 'sawCompleted'> = { added: 0, updated: 0, skipped: 0 },
  ): RefreshOutcome {
    const resetAt = error.code === CI_ERROR.rateLimited ? resetAtOf(error) : undefined;
    return {
      error,
      result: {
        installation_id: installationId,
        status: 'failed',
        added: tally.added,
        updated: tally.updated,
        skipped: tally.skipped,
        failure: { code: error.code, ...(resetAt !== undefined ? { reset_at: resetAt } : {}) },
      },
    };
  }

  // ------------------------------------------------------------------ helpers

  private assertTarget(target: CiTarget): void {
    if (target !== 'gha') throw ciError(CI_ERROR.unsupportedTarget);
  }

  /** The stored GitHub token. `container.github()` would throw a 500 config error, so check first. */
  private async requireToken(): Promise<string> {
    const token = await this.container.secrets.get(GITHUB_TOKEN_KEY);
    if (!token) throw ciError(CI_ERROR.githubTokenMissing);
    return token;
  }

  private async requireAgent(workspaceId: string, agentId: string): Promise<AgentRow> {
    const agent = await this.repo.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError(NOT_FOUND_AGENT);
    return agent;
  }

  /** A client-edited workflow is validated before it is used; the only client text we accept (AC-20). */
  private checkedWorkflow(input: CiExportInput): string | undefined {
    if (input.workflow_yaml === undefined) return undefined;
    assertValidWorkflowYaml(input.workflow_yaml);
    return input.workflow_yaml;
  }

  /** Agent, repo, skills, memory and the manifest slug an export is built from (all workspace-scoped). */
  private async loadContext(
    workspaceId: string,
    agentId: string,
    repoName: string,
  ): Promise<ExportContext> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const repo = await this.repo.findRepoByFullName(workspaceId, repoName);
    if (!repo) throw new NotFoundError(NOT_FOUND_REPO);

    const [skills, memory, memoryTotal, existing] = await Promise.all([
      this.repo.enabledSkillsInLinkOrder(workspaceId, agent.id),
      this.repo.repoMemoryRows(workspaceId, repo.id, MEMORY_MAX_ROWS),
      this.repo.countRepoMemory(workspaceId, repo.id),
      this.repo.findInstallationByRepo(workspaceId, repo.fullName),
    ]);
    // Reuse the first export's manifest slug so renaming the agent never adds a second manifest.
    const manifestSlug =
      existing && existing.installation.agentId === agent.id
        ? existing.installation.manifestSlug
        : slugify(agent.name);
    return {
      agent,
      repo,
      skills,
      memoryRows: memory.map((m: CiMemoryRow) => toMemoryExportRow(m)),
      memoryTotal,
      manifestSlug,
      existing,
    };
  }

  private assemble(
    ctx: ExportContext,
    input: CiExportInput,
    runnerFiles: Parameters<typeof assembleExport>[0]['runnerFiles'],
    workflowOverride: string | undefined,
  ): AssembledExport {
    return assembleExport({
      agent: toManifestAgent(ctx.agent),
      manifestSlug: ctx.manifestSlug,
      skills: ctx.skills.map((s) => ({ name: s.name, body: s.body })),
      memoryRows: ctx.memoryRows,
      memoryTotal: ctx.memoryTotal,
      runnerFiles,
      workflow: { triggers: input.triggers, postAs: input.post_as },
      ...(workflowOverride !== undefined ? { workflowOverride } : {}),
    });
  }

  /** The repository already belongs to another agent's installation: nothing is written (AC-32). */
  private assertNotTaken(ctx: ExportContext): void {
    if (ctx.existing && ctx.existing.installation.agentId !== ctx.agent.id) {
      throw this.repoTaken(ctx.existing.installation, ctx.existing.agentName);
    }
  }

  private repoTaken(installation: { id: string; agentId: string }, agentName: string): AppError {
    return ciError(CI_ERROR.repoTaken, {
      agent_id: installation.agentId,
      agent_name: agentName,
      installation_id: installation.id,
    });
  }

  /** Serialise exports of one repository: a second concurrent one is refused. */
  private async withExportLock<T>(
    workspaceId: string,
    repoName: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = `${workspaceId}:${repoName.toLowerCase()}`;
    if (this.exportLocks.has(key)) throw ciError(CI_ERROR.exportRunning);
    this.exportLocks.add(key);
    try {
      return await fn();
    } finally {
      this.exportLocks.delete(key);
    }
  }

  /**
   * Reuse the open pull request of `devdigest/ci`, else open one. An unchanged tree
   * with no open PR is `ci_no_changes`; a failure after the commit is `ci_pr_failed`
   * carrying the branch so the user can retry or open the PR by hand.
   */
  private async openOrReusePr(
    gh: GitHubClient,
    ref: RepoRef,
    ctx: ExportContext,
    fileCount: number,
    changed: boolean,
  ): Promise<string | null> {
    const prFailed = () => ciError(CI_ERROR.prFailed, { branch: CI_BRANCH });
    let open: { url: string } | null;
    try {
      open = await gh.findOpenPr(ref, CI_BRANCH);
    } catch {
      throw prFailed();
    }
    if (open) return trustedPrUrl(open.url, ctx.repo.fullName);
    if (!changed) throw ciError(CI_ERROR.noChanges);
    try {
      const created = await gh.openPullRequest(ref, {
        title: PR_TITLE,
        head: CI_BRANCH,
        base: ctx.repo.defaultBranch,
        body: buildPrBody(ctx.repo.fullName, fileCount),
      });
      return trustedPrUrl(created.url, ctx.repo.fullName);
    } catch {
      throw prFailed();
    }
  }

  private async installationDto(workspaceId: string, id: string): Promise<CiInstallation> {
    const item = await this.repo.getInstallation(workspaceId, id);
    if (!item) throw new NotFoundError(NOT_FOUND_INSTALLATION);
    const [last] = await this.repo.lastRunPerInstallation(workspaceId, [id]);
    return toCiInstallation(item, last);
  }
}
