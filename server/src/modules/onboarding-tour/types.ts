import type { TourRankingMode } from '@devdigest/shared';

/** One ranked file. `rank` is the file_rank percentile (0..1). */
export interface RankedFile {
  path: string;
  rank: number;
  hotness?: number;
}

export interface ManifestFact {
  /** Repo-relative path, e.g. `packages/api/package.json`. */
  path: string;
  /** Directory of the manifest (`''` for the repo root). */
  dir: string;
  name: string;
  text: string;
  /** Package manager for this manifest's directory (own lockfile, else the root's). */
  pm?: string;
  /** True when the directory has its own lockfile, so it needs its own install step. */
  ownLockfile?: boolean;
}

/** Everything the skeleton (and, later, the model prompt) is built from. */
export interface TourFacts {
  ranked: RankedFile[];
  chains: string[][];
  manifests: ManifestFact[];
  packageManager: string;
  hasReadme: boolean;
  degradedReason: string | null;
  indexSha: string | null;
  mode: TourRankingMode;
  windowDays: number | null;
  rankingFallback: string | null;
}
