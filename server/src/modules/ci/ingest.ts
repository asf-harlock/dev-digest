import { unzipSync } from 'fflate';
import { CiResultArtifact, CiRunMeta } from '@devdigest/shared';
import {
  ARTIFACT_MAX_COMPRESSED_BYTES,
  ARTIFACT_MAX_COST_USD,
  ARTIFACT_MAX_DURATION_MS,
  ARTIFACT_MAX_ENTRIES,
  ARTIFACT_MAX_ENTRY_BYTES,
  ARTIFACT_MAX_FINDINGS,
  ARTIFACT_REJECTED,
  RESULT_FILENAME,
  RUN_META_FILENAME,
} from './constants.js';

/**
 * Verification of a downloaded `devdigest-result` artifact (UI-8, UI-9, EC-19..EC-21).
 *
 * The artifact is produced by the repository's own workflow, so a PR author can
 * forge it. Pure: takes the zip bytes, returns a verdict on them. No DB, no HTTP.
 */

export interface IngestCheckInput {
  zipBytes: Uint8Array;
  /** `head_sha` of the workflow run the artifact belongs to. */
  headSha: string;
  /** `owner/name` of the installation. */
  installationRepo: string;
  /** The PR number GitHub associates with the run, when it reports exactly one. */
  installationPrNumber?: number | null;
}

/** The artifact numbers after validation. `agent` and every other text field is dropped (UI-9). */
export interface CheckedArtifact {
  findings_count: number;
  critical: number;
  warning: number;
  suggestion: number;
  cost_usd: number | null;
  duration_ms: number | null;
  pr_number: number;
}

export type IngestCheckResult =
  | { ok: true; artifact: CheckedArtifact; meta: CiRunMeta }
  | { ok: false; reason: typeof ARTIFACT_REJECTED; detail: string };

/** `ci_runs.pr_number` is a 32-bit integer; a larger forged value must never reach the DB. */
const MAX_PR_NUMBER = 2_147_483_647;

const KNOWN_ENTRIES: ReadonlySet<string> = new Set([RESULT_FILENAME, RUN_META_FILENAME]);

function reject(detail: string): IngestCheckResult {
  return { ok: false, reason: ARTIFACT_REJECTED, detail };
}

/** Absolute (POSIX, Windows drive, UNC) or `..`-containing entry path. */
function isUnsafeEntryPath(name: string): boolean {
  if (name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:/.test(name)) return true;
  return name.split(/[\\/]+/).includes('..');
}

function validPrNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_PR_NUMBER;
}

function withinBound(value: number, max: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= max;
}

/**
 * Unzip only the two known entries, enforcing the entry-count, entry-size and
 * path limits; every other entry is skipped without being inflated (EC-19).
 */
function readEntries(
  zipBytes: Uint8Array,
): { ok: true; entries: Record<string, Uint8Array> } | { ok: false; detail: string } {
  if (zipBytes.byteLength > ARTIFACT_MAX_COMPRESSED_BYTES) {
    return { ok: false, detail: 'compressed size over the limit' };
  }
  let count = 0;
  let violation: string | null = null;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes, {
      filter: (file) => {
        count += 1;
        if (isUnsafeEntryPath(file.name)) violation ??= 'unsafe entry path';
        if (!KNOWN_ENTRIES.has(file.name)) return false;
        if (file.originalSize > ARTIFACT_MAX_ENTRY_BYTES) {
          violation ??= 'entry too large';
          return false;
        }
        return violation === null && count <= ARTIFACT_MAX_ENTRIES;
      },
    });
  } catch {
    return { ok: false, detail: 'not a readable zip' };
  }
  if (count > ARTIFACT_MAX_ENTRIES) return { ok: false, detail: 'too many entries' };
  if (violation !== null) return { ok: false, detail: violation };
  return { ok: true, entries };
}

function parseJson(bytes: Uint8Array | undefined): unknown {
  if (!bytes || bytes.byteLength > ARTIFACT_MAX_ENTRY_BYTES) return undefined;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
}

/**
 * Verify a downloaded artifact against the run it was attached to.
 * Any failure is `artifact_rejected` — the run is stored as failed with that reason.
 */
export function checkIngestArtifact(input: IngestCheckInput): IngestCheckResult {
  const unzipped = readEntries(input.zipBytes);
  if (!unzipped.ok) return reject(unzipped.detail);

  const rawResult = parseJson(unzipped.entries[RESULT_FILENAME]);
  const rawMeta = parseJson(unzipped.entries[RUN_META_FILENAME]);
  if (rawResult === undefined) return reject('result entry missing or not JSON');
  if (rawMeta === undefined) return reject('run metadata entry missing or not JSON');

  const result = CiResultArtifact.safeParse(rawResult);
  if (!result.success) return reject('result failed schema validation');
  const meta = CiRunMeta.safeParse(rawMeta);
  if (!meta.success) return reject('run metadata failed schema validation');

  const a = result.data;
  const counts = {
    critical: a.critical ?? 0,
    warning: a.warning ?? 0,
    suggestion: a.suggestion ?? 0,
  };
  const severityTotal = counts.critical + counts.warning + counts.suggestion;
  if (
    !withinBound(a.findings_count, ARTIFACT_MAX_FINDINGS) ||
    !withinBound(counts.critical, ARTIFACT_MAX_FINDINGS) ||
    !withinBound(counts.warning, ARTIFACT_MAX_FINDINGS) ||
    !withinBound(counts.suggestion, ARTIFACT_MAX_FINDINGS) ||
    severityTotal > a.findings_count ||
    (a.cost_usd !== null && !withinBound(a.cost_usd, ARTIFACT_MAX_COST_USD)) ||
    (a.duration_ms != null && !withinBound(a.duration_ms, ARTIFACT_MAX_DURATION_MS))
  ) {
    return reject('numbers out of bounds');
  }

  const m = meta.data;
  if (m.commit_sha.trim().toLowerCase() !== input.headSha.trim().toLowerCase()) {
    return reject('commit sha differs from the run head sha');
  }
  if (m.repository.toLowerCase() !== input.installationRepo.toLowerCase()) {
    return reject('repository differs from the installation');
  }
  if (!validPrNumber(a.pr_number) || !validPrNumber(m.pr_number)) {
    return reject('pull request number out of bounds');
  }
  if (m.pr_number !== a.pr_number) {
    return reject('pull request number differs between result and metadata');
  }
  if (input.installationPrNumber != null && m.pr_number !== input.installationPrNumber) {
    return reject('pull request number differs from the run');
  }

  return {
    ok: true,
    artifact: {
      findings_count: a.findings_count,
      ...counts,
      cost_usd: a.cost_usd,
      duration_ms: a.duration_ms ?? null,
      pr_number: a.pr_number,
    },
    meta: m,
  };
}
