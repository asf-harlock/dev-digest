import type { Finding, Review } from '@devdigest/shared';

/**
 * Redact secret-shaped strings out of model-authored free text before a
 * Review leaves the engine.
 *
 * The citation-grounding gate (`grounding.ts`) proves a finding's file:line
 * exists in the diff; it says nothing about the CONTENT of that finding's
 * text fields. A finding that cites a perfectly real line can still carry a
 * `rationale`/`suggestion`/summary the model was talked into stuffing with a
 * real secret — its own system prompt, an env value, an API key visible
 * anywhere in its context — and grounding lets it straight through. This is
 * the last line of defense: independent of WHY a secret-shaped string ended
 * up in model output (an adversarial/imported skill body asking for it, or a
 * model just confabulating), it never leaves the pipeline.
 *
 * Deliberately conservative: only well-known token/key SHAPES, no generic
 * high-entropy heuristic — the goal is zero false positives on ordinary
 * review prose, not maximum recall.
 */

interface SecretPattern {
  name: string;
  re: RegExp;
}

// Order matters: more specific prefixes (sk-or-v1-, sk-ant-) must run before
// the generic `sk-` shape, or the generic pattern would win the match and the
// specific `kind` label would never be recorded.
const SECRET_PATTERNS: SecretPattern[] = [
  { name: 'aws_access_key_id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'openrouter_key', re: /\bsk-or-v1-[a-f0-9]{64}\b/g },
  { name: 'anthropic_key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'openai_key', re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: 'github_token', re: /\bgh[opusr]_[A-Za-z0-9]{36,}\b/g },
  { name: 'stripe_key', re: /\bsk_(?:live|test)_[A-Za-z0-9]{10,}\b/g },
  { name: 'slack_token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    name: 'private_key_block',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'bearer_token', re: /\bBearer\s+[A-Za-z0-9\-_.=]{20,}\b/g },
];

export interface RedactResult {
  text: string;
  /** Which pattern name(s) fired, in order (empty when nothing matched). */
  kinds: string[];
}

/** Redact every recognized secret shape in `text`. */
export function redactSecrets(text: string): RedactResult {
  const kinds: string[] = [];
  let out = text;
  for (const { name, re } of SECRET_PATTERNS) {
    out = out.replace(re, () => {
      kinds.push(name);
      return `[REDACTED:${name}]`;
    });
  }
  return { text: out, kinds };
}

function redactFinding(f: Finding): { finding: Finding; kinds: string[] } {
  const title = redactSecrets(f.title);
  const rationale = redactSecrets(f.rationale);
  const suggestion = f.suggestion != null ? redactSecrets(f.suggestion) : null;
  const kinds = [...title.kinds, ...rationale.kinds, ...(suggestion?.kinds ?? [])];
  if (kinds.length === 0) return { finding: f, kinds };
  return {
    finding: {
      ...f,
      title: title.text,
      rationale: rationale.text,
      ...(suggestion ? { suggestion: suggestion.text } : {}),
    },
    kinds,
  };
}

/** Redact every free-text field of a Review (`summary` + each finding). */
export function redactReview(review: Review): { review: Review; kinds: string[] } {
  const summary = redactSecrets(review.summary);
  const findings: Finding[] = [];
  const kinds = [...summary.kinds];
  for (const f of review.findings) {
    const r = redactFinding(f);
    findings.push(r.finding);
    kinds.push(...r.kinds);
  }
  if (kinds.length === 0) return { review, kinds };
  return { review: { ...review, summary: summary.text, findings }, kinds };
}
