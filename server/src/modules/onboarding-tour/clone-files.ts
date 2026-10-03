import { readdir } from 'node:fs/promises';
import { readContextFile } from '../_shared/project-context.js';
import {
  DEFAULT_PACKAGE_MANAGER,
  LOCKFILE_MANAGERS,
  MANIFEST_NAMES,
  MAX_MANIFEST_BYTES,
  MAX_PACKAGE_DIRS,
  PACKAGE_CONTAINER_DIRS,
} from './constants.js';
import type { ManifestFact } from './types.js';

/**
 * Read-only scan of a repo clone for manifest facts. Never executes repo code
 * and never follows symlinks (`readContextFile` refuses them). Unreadable or
 * oversized files are skipped, not fatal.
 */

async function listDir(path: string): Promise<{ name: string; isDir: boolean }[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .map((e) => ({ name: e.name, isDir: e.isDirectory() }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } catch {
    return [];
  }
}

function lockfileManager(files: ReadonlySet<string>): string | undefined {
  return LOCKFILE_MANAGERS.find(([file]) => files.has(file))?.[1];
}

async function readManifests(
  clonePath: string,
  dir: string,
  present: Set<string>,
  rootPm: string,
): Promise<ManifestFact[]> {
  const out: ManifestFact[] = [];
  const own = lockfileManager(present);
  for (const name of MANIFEST_NAMES) {
    if (!present.has(name)) continue;
    const path = dir ? `${dir}/${name}` : name;
    const read = await readContextFile(clonePath, path, MAX_MANIFEST_BYTES);
    if (read.status === 'ok') out.push({ path, dir, name, text: read.text, pm: own ?? rootPm, ownLockfile: own !== undefined });
  }
  return out;
}

export interface CloneScan {
  manifests: ManifestFact[];
  packageManager: string;
  hasReadme: boolean;
}

export async function scanClone(clonePath: string): Promise<CloneScan> {
  const root = await listDir(clonePath);
  const rootFiles = new Set(root.filter((e) => !e.isDir).map((e) => e.name));
  const pm = lockfileManager(rootFiles) ?? DEFAULT_PACKAGE_MANAGER;
  const manifests = await readManifests(clonePath, '', rootFiles, pm);

  const pkgDirs: string[] = [];
  const rootDirs = new Set(root.filter((e) => e.isDir).map((e) => e.name));
  for (const c of PACKAGE_CONTAINER_DIRS) {
    if (!rootDirs.has(c)) continue;
    for (const child of await listDir(`${clonePath}/${c}`)) {
      if (child.isDir) pkgDirs.push(`${c}/${child.name}`);
    }
  }
  // Top-level directories are scanned too (e.g. `server/`, `client/`).
  for (const d of [...rootDirs].sort()) {
    if (d.startsWith('.') || d === 'node_modules' || (PACKAGE_CONTAINER_DIRS as readonly string[]).includes(d)) continue;
    pkgDirs.push(d);
  }
  for (const dir of pkgDirs.slice(0, MAX_PACKAGE_DIRS)) {
    const files = new Set((await listDir(`${clonePath}/${dir}`)).filter((e) => !e.isDir).map((e) => e.name));
    manifests.push(...(await readManifests(clonePath, dir, files, pm)));
  }

  const hasReadme = rootFiles.has('README.md');
  return { manifests, packageManager: pm, hasReadme };
}
