import { PROMPT_DIFF_MAX_LINES } from './constants.js';

/**
 * SPEC-08 AC-48/AC-50 — line diff of two snapshotted system prompts. Pure.
 * Classic LCS table; fine for prompts of a few hundred lines. Beyond
 * `PROMPT_DIFF_MAX_LINES` per side it degrades to remove-all + add-all rather
 * than allocate a huge table.
 */

export type PromptDiffLine = { kind: 'added' | 'removed' | 'context'; text: string };

export function diffLines(oldText: string, newText: string): PromptDiffLine[] {
  if (oldText === newText) {
    return oldText.split('\n').map((text) => ({ kind: 'context' as const, text }));
  }
  const a = oldText.split('\n');
  const b = newText.split('\n');

  if (a.length > PROMPT_DIFF_MAX_LINES || b.length > PROMPT_DIFF_MAX_LINES) {
    return [
      ...a.map((text) => ({ kind: 'removed' as const, text })),
      ...b.map((text) => ({ kind: 'added' as const, text })),
    ];
  }

  // lcs[i][j] = LCS length of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: PromptDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'context', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: 'removed', text: a[i]! });
      i++;
    } else {
      out.push({ kind: 'added', text: b[j]! });
      j++;
    }
  }
  while (i < a.length) out.push({ kind: 'removed', text: a[i++]! });
  while (j < b.length) out.push({ kind: 'added', text: b[j++]! });
  return out;
}
