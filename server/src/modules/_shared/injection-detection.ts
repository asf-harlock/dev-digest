/**
 * Prompt-injection pattern detection for skill bodies. Shared by `skills`
 * (computing `Skill.injection_flagged` on every read, and enforcing it on
 * create/update) and `agents` (mapping a linked skill to `AgentSkillDetail`,
 * which extends `Skill` with the same fields) — lives here, not in either
 * module, because `no-cross-module-import` (`.dependency-cruiser.cjs`)
 * forbids one module reaching into another's `helpers.ts`.
 */

export interface InjectionDetection {
  detected: boolean;
  patterns: string[];
}

/**
 * Conservative, well-known prompt-injection PHRASINGS — not a generic
 * "sounds suspicious" heuristic. Each pattern targets a specific technique a
 * skill body has no legitimate reason to use (an ordinary review-rubric skill
 * never needs to tell the model to ignore its instructions, fake a closing
 * `</untrusted>` tag, or ask it to copy a secret into its output). Chosen to
 * match zero false positives on this repo's own built-in skills while still
 * catching every technique demonstrated in the injection-test fixtures this
 * feature exists to block.
 */
export const INJECTION_PATTERNS: { name: string; re: RegExp }[] = [
  {
    name: 'instruction-override',
    re: /\b(ignore|disregard)\b[^.\n]{0,40}\b(previous|prior|above|preceding|all|every)\b[^.\n]{0,20}\b(instructions?|rules?)\b/i,
  },
  {
    name: 'system-override',
    re: /\bsystem\s*overrides?\b|\bnew system (message|prompt)\b|\byou are no longer\b/i,
  },
  { name: 'delimiter-escape', re: /<\/?(untrusted|task|system)(\s[^>]*)?>/i },
  {
    name: 'verdict-override',
    re: /\b(no matter what|regardless of what)\b[^.\n]{0,40}\b(find|findings|diff)\b|\balways (return|set|report)\b[^.\n]{0,20}\bverdict\b/i,
  },
  {
    name: 'silence-request',
    re: /\bdo not (mention|reveal|disclose)\b[^.\n]{0,40}\b(this|that|instruction)\b/i,
  },
  {
    name: 'exfiltration-request',
    re: /\b(copy|include|paste|reveal)\b[^.\n]{0,60}\b(system prompt|api key|secret|environment variable)/i,
  },
  {
    name: 'fabricated-authority',
    re: /\b(security team|already (been )?(audited|reviewed|verified))\b[^.\n]{0,40}\b(skip|approve|no need)\b/i,
  },
  {
    name: 'fabricated-findings',
    re: /\binvent\b[^.\n]{0,30}\b(finding|issue)s?\b|\bat least \d+ findings\b/i,
  },
];

/**
 * Scan a skill body for known prompt-injection phrasings. Pure and
 * deterministic, so it is computed live from `body` wherever a skill is read
 * or written — never stored, so it can never go stale relative to the text it
 * describes (an edit that removes the injected text un-flags the skill on its
 * own; an edit that adds one flags it immediately, no migration or backfill
 * needed).
 */
export function detectInjectionPatterns(body: string): InjectionDetection {
  const patterns: string[] = [];
  for (const { name, re } of INJECTION_PATTERNS) {
    if (re.test(body)) patterns.push(name);
  }
  return { detected: patterns.length > 0, patterns };
}
