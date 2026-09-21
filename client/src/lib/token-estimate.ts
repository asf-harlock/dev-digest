/* Client-side approximation only — the Skills edit flow shows the server's
   real tokenizer count (`skill.token_estimate`) once a skill is saved; this
   heuristic is for a live count while composing a draft that hasn't been
   saved yet, so there's nothing to ask the server for. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
