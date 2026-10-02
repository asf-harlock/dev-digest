/**
 * Parser for one `git ls-tree -l -z` record (SPEC-07). Pure — no I/O.
 *
 * Record: `<mode> SP <type> SP <oid> SP+ <size|-> TAB <path> NUL`. With `-z`
 * the path is raw (never quoted), so no unquoting is attempted. Only a record
 * whose path equals the requested one is accepted.
 */
export interface LsTreeEntry {
  mode: string;
  type: string;
  oid: string;
  /** Blob size in bytes; null for non-blobs (`-`). */
  size: number | null;
  path: string;
}

const RECORD = /^(\d{6}) (\w+) ([0-9a-f]{40,64}) +(-|\d+)\t([\s\S]*)$/;

export function parseLsTreeEntry(output: string, requestedPath: string): LsTreeEntry | null {
  for (const rec of output.split('\0')) {
    if (rec.length === 0) continue;
    const m = RECORD.exec(rec);
    if (!m) continue;
    if (m[5] !== requestedPath) continue;
    return {
      mode: m[1]!,
      type: m[2]!,
      oid: m[3]!,
      size: m[4] === '-' ? null : Number(m[4]),
      path: m[5]!,
    };
  }
  return null;
}
