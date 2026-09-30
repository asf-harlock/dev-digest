import type { SpecFile } from '@devdigest/shared';
import { detectInjectionPatterns, findInjectionMatches } from '../_shared/injection-detection.js';
import { kindForPath } from '../_shared/context-paths.js';
import type { ContextFileRead, ScannedContextFile } from '../_shared/project-context.js';

/**
 * Pure helpers for the context module — no I/O, no container.
 */

/**
 * Distinct agents that would receive each path: direct attachments, plus
 * attachments of a skill linked to the agent while BOTH the link and the skill
 * are enabled. The two row sets are already filtered/scoped by the repository.
 */
export function computeUsedBy(
  agents: readonly { id: string; contextPaths: readonly string[] }[],
  skillLinks: readonly { agentId: string; contextPaths: readonly string[] }[],
): Map<string, number> {
  const byPath = new Map<string, Set<string>>();
  const add = (path: string, agentId: string) => {
    const set = byPath.get(path) ?? new Set<string>();
    set.add(agentId);
    byPath.set(path, set);
  };
  for (const a of agents) for (const p of a.contextPaths) add(p, a.id);
  for (const l of skillLinks) for (const p of l.contextPaths) add(p, l.agentId);
  return new Map([...byPath].map(([path, ids]) => [path, ids.size]));
}

/**
 * Build the `SpecFile` for one scanned document. `tokens` is only meaningful
 * (and only set) for a readable UTF-8 file; `content` only when the caller is
 * the preview route.
 */
export function buildSpecFile(
  scanned: Pick<ScannedContextFile, 'path' | 'size' | 'mtimeMs'>,
  read: ContextFileRead,
  opts: { tokens: number | null; usedBy: number; includeContent: boolean },
): SpecFile {
  const file: SpecFile = {
    path: scanned.path,
    size: scanned.size,
    updated_at: new Date(scanned.mtimeMs).toISOString(),
    kind: kindForPath(scanned.path),
    used_by: opts.usedBy,
    attachable: read.status === 'ok',
  };
  if (read.status === 'too_large') file.unattachable_reason = 'too_large';
  if (read.status === 'not_utf8') file.unattachable_reason = 'not_utf8';
  if (read.status === 'ok') {
    const injection = detectInjectionPatterns(read.text, { ignoreCode: true });
    file.tokens = opts.tokens;
    file.injection_flagged = injection.detected;
    file.injection_patterns = injection.patterns;
    if (opts.includeContent) {
      file.content = read.text;
      if (injection.detected) file.injection_matches = findInjectionMatches(read.text, { ignoreCode: true });
    }
  }
  return file;
}
