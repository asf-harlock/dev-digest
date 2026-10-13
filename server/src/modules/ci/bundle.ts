import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  CI_ERROR,
  CI_ERROR_MESSAGE,
  CI_ERROR_STATUS,
  RUNNER_DIR,
  RUNNER_REQUIRED_FILES,
} from './constants.js';
import { AppError, NotFoundError } from '../../platform/errors.js';

/**
 * The built `agent-runner/dist` directory, copied whole into `.devdigest/runner/`
 * (AC-31, EC-3). The directory is read from disk; its path comes from config
 * (`agentRunnerDist`) and is passed in, so this module never reads `process.env`.
 *
 * The runner needs more than `index.js`: `package.json` (`{"type":"module"}`,
 * without it the runner fails in target repos that are `"type":"commonjs"`)
 * and the code-split chunks (`382.index.js`, …). Every file is shipped.
 */

export interface RunnerFileInfo {
  /** POSIX path relative to the dist directory, e.g. `index.js`. */
  path: string;
  size_bytes: number;
}

const IGNORED_NAMES = new Set(['.DS_Store']);

function bundleMissing(): AppError {
  return new AppError(
    CI_ERROR.runnerBundleMissing,
    CI_ERROR_MESSAGE.runner_bundle_missing,
    CI_ERROR_STATUS.runner_bundle_missing,
  );
}

async function walk(root: string, rel: string, out: RunnerFileInfo[]): Promise<void> {
  const entries = await readdir(path.join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue;
    const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      await walk(root, childRel, out);
    } else if (entry.isFile()) {
      const info = await stat(path.join(root, childRel));
      out.push({ path: childRel, size_bytes: info.size });
    }
    // Symlinks and other special files are never followed or shipped.
  }
}

/**
 * Every file of the dist directory, sorted by path (deterministic, NFR-5),
 * without contents. Throws 409 `runner_bundle_missing` when the directory is
 * missing, empty, or lacks `index.js` or `package.json`.
 */
export async function listRunnerFiles(distDir: string): Promise<RunnerFileInfo[]> {
  const files: RunnerFileInfo[] = [];
  try {
    await walk(path.resolve(distDir), '', files);
  } catch {
    throw bundleMissing();
  }
  const present = new Set(files.map((f) => f.path));
  if (files.length === 0 || RUNNER_REQUIRED_FILES.some((name) => !present.has(name))) {
    throw bundleMissing();
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Contents of one runner file. `relPath` is dist-relative or the repository path
 * (`.devdigest/runner/<rel>`); it is honoured only when it is in the listing,
 * so nothing outside the dist directory can be read (no traversal).
 */
export async function readRunnerFile(distDir: string, relPath: string): Promise<string> {
  const wanted = relPath.startsWith(`${RUNNER_DIR}/`) ? relPath.slice(RUNNER_DIR.length + 1) : relPath;
  const listing = await listRunnerFiles(distDir);
  if (!listing.some((f) => f.path === wanted)) throw new NotFoundError('Runner file not found');
  return readFile(path.join(path.resolve(distDir), ...wanted.split('/')), 'utf8');
}

/** Every runner file with its contents, in listing order (for the export and the zip). */
export async function readRunnerFiles(
  distDir: string,
): Promise<Array<RunnerFileInfo & { contents: string }>> {
  const listing = await listRunnerFiles(distDir);
  const root = path.resolve(distDir);
  return Promise.all(
    listing.map(async (f) => ({
      ...f,
      contents: await readFile(path.join(root, ...f.path.split('/')), 'utf8'),
    })),
  );
}
