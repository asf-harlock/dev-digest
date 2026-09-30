import {
  FEATURE_MODELS,
  Onboarding,
  type OnboardingTourGenerateRequest,
  type OnboardingTourResponse,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { cloneDirExists } from '../_shared/project-context.js';
import { scanClone } from './clone-files.js';
import {
  ERROR_ALREADY_GENERATING,
  ERROR_REPO_NOT_FOUND,
  FALLBACK_ACTIVITY_UNAVAILABLE,
  GENERATE_FAILED_MESSAGE,
  RANKED_FILES_LIMIT,
  REASON_BY_INDEX,
  REASON_INDEX_UNAVAILABLE,
  REASON_NOT_CLONED,
  REASON_NO_INDEX,
} from './constants.js';
import { buildSkeleton, computeStale } from './helpers.js';
import { OnboardingTourRepository, type TourRepoRow } from './repository.js';
import type { RankedFile, TourFacts } from './types.js';

export type TourLogger = { warn: (obj: unknown, msg?: string) => void };

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

  constructor(private container: Container) {
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
    const override = await this.repo.getFeatureModelOverride(workspaceId, 'onboarding');
    if (override) return override;
    const def = FEATURE_MODELS.find((f) => f.id === 'onboarding');
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
      stale: stored && computeStale(tour.meta.index_sha, currentSha),
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
    if (generating.has(repoId)) throw new ConflictError(ERROR_ALREADY_GENERATING);
    generating.add(repoId);
    void this.generate(workspaceId, repo, opts)
      .catch(async (err: unknown) => {
        log?.warn({ repoId, err: err instanceof Error ? err.message : String(err) }, 'onboarding tour generation failed');
        await this.recordFailure(workspaceId, repoId).catch(() => undefined);
      })
      .finally(() => generating.delete(repoId));
  }

  /** Skeleton only in slice 2. Slice 3 enriches this tour; slice 4 feeds it activity facts. */
  private async generate(workspaceId: string, repo: TourRepoRow, opts: GenerateOptions): Promise<void> {
    const cloned = await this.cloned(repo);
    const facts = await this.collectFacts(repo, cloned, opts);
    const tour = buildSkeleton(facts);
    const now = new Date();
    tour.meta.generated_at = now.toISOString();
    await this.repo.upsert(workspaceId, repo.id, tour, now);
  }

  /** A failed run keeps the previous tour and records why in its meta. */
  private async recordFailure(workspaceId: string, repoId: string): Promise<void> {
    const row = await this.repo.getStored(workspaceId, repoId);
    const parsed = row ? Onboarding.safeParse(row.json) : undefined;
    if (!row || !parsed?.success) return;
    const tour = parsed.data;
    tour.meta.last_error = GENERATE_FAILED_MESSAGE;
    await this.repo.upsert(workspaceId, repoId, tour, row.generatedAt);
  }

  /** Gather the deterministic facts. Every source degrades to empty; none throws. */
  private async collectFacts(repo: TourRepoRow, cloned: boolean, opts: Partial<GenerateOptions>): Promise<TourFacts> {
    const intel = this.container.repoIntel;
    const state = await intel.getIndexState(repo.id).catch(() => null);

    let ranked: RankedFile[] = [];
    let chains: string[][] = [];
    if (state && !state.degraded && state.status !== 'failed') {
      const paths = await intel.getTopFilesByRank(repo.id, RANKED_FILES_LIMIT).catch(() => []);
      const ranks = await intel.getFileRank(repo.id, paths).catch(() => []);
      const pct = new Map(ranks.map((r) => [r.path, r.percentile]));
      ranked = paths.map((path) => ({ path, rank: pct.get(path) ?? 0 }));
      chains = await intel.getCriticalPaths(repo.id).catch(() => []);
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
      mode: 'import_graph',
      windowDays: null,
      rankingFallback: opts.mode === 'activity' ? FALLBACK_ACTIVITY_UNAVAILABLE : null,
    };
  }
}
