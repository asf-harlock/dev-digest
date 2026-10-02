/**
 * PR Context (SPEC-07) — truncation and fingerprint. Pure, no I/O.
 */
import { createHash } from 'node:crypto';

/** AC-18 marker appended to a cut document. */
export function truncationMarker(kept: number, total: number): string {
  return `[truncated: ${kept} of ${total} tokens]`;
}

export interface TruncateResult {
  /** The cut text with the marker appended. */
  text: string;
  /** Tokens (as `count` measures them) of the final text. */
  tokens: number;
}

/**
 * AC-18: cut `text` so `count(final)` fits `remaining`. `count` must measure
 * the text as the prompt carries it (wrapped). Cuts before the last markdown
 * heading line that fits, else after the last whole line that fits. Returns
 * null when not even the first line fits.
 */
export function truncateToBudget(
  text: string,
  remaining: number,
  count: (text: string) => number,
): TruncateResult | null {
  const lines = text.split('\n');
  const total = count(text);
  const build = (k: number): string => {
    const kept = lines.slice(0, k).join('\n');
    return `${kept}\n\n${truncationMarker(count(kept), total)}`;
  };
  const fits = (k: number) => count(build(k)) <= remaining;

  // Largest prefix (in whole lines) that fits; prefixes grow monotonically.
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  const best = lo;
  if (best === 0 || !fits(best)) return null;

  let cut = best;
  for (let i = best; i >= 1; i--) {
    // cutting before heading line `i` keeps lines [0, i)
    if (i < lines.length && /^#{1,6}\s/.test(lines[i]!) && fits(i)) {
      cut = i;
      break;
    }
  }
  const out = build(cut);
  return { text: out, tokens: count(out) };
}

export interface FingerprintItem {
  path: string;
  /** Blob id at the head SHA when the document was read. */
  blobId: string | null;
  /** Resolver status; used in place of the blob id when unresolved. */
  status: string;
}

/**
 * AC-37: hash over the ordered paths and, for each, its blob id or its
 * unresolved status. Null for an empty list.
 */
export function computeContextFingerprint(items: readonly FingerprintItem[]): string | null {
  if (items.length === 0) return null;
  const h = createHash('sha256');
  for (const it of items) {
    h.update(JSON.stringify([it.path, it.blobId ?? `status:${it.status}`]));
    h.update('\n');
  }
  return h.digest('hex').slice(0, 32);
}
