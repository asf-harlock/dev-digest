import { strToU8, zipSync } from 'fflate';
import { slugify } from './helpers.js';

/**
 * The manual-install archive (AC-16). Built with `fflate`; entries are stored in
 * the order given and stamped with a fixed date so the same files give the same bytes.
 */

const ARCHIVE_PREFIX = 'devdigest-ci-';
const ARCHIVE_EXTENSION = '.zip';
const REPO_SLUG_FALLBACK = 'repo';
/** DOS dates start in 1980; a fixed local date keeps the archive reproducible. */
const FIXED_MTIME = new Date(2000, 0, 1);

export function buildZip(files: ReadonlyArray<{ path: string; contents: string }>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.path] = strToU8(f.contents);
  return zipSync(entries, { mtime: FIXED_MTIME });
}

/** `devdigest-ci-<repo-name>.zip` — the name part is reduced to `[a-z0-9-]`, safe in a header. */
export function archiveFilename(repoName: string): string {
  return `${ARCHIVE_PREFIX}${slugify(repoName, REPO_SLUG_FALLBACK)}${ARCHIVE_EXTENSION}`;
}
