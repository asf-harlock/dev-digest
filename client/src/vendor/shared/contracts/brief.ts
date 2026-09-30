import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
/** One input the intent classifier drew on (or tried to). */
export const IntentSource = z.object({
  kind: z.enum(['title', 'description', 'linked_issue', 'spec', 'hunk_headers']),
  status: z.enum(['used', 'missing', 'unreachable']),
  note: z.string().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  /** How confident the classification is — low when key sources were missing
   *  or unreachable (e.g. an empty description). Defaults 'high' for callers
   *  (older persisted rows / other producers) that don't set it explicitly. */
  confidence: z.enum(['high', 'medium', 'low']).default('high'),
  /** Which sources were used/missing/unreachable — never silently fabricated. */
  sources: z.array(IntentSource).default([]),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

/** Why the map may be incomplete — mirrors repo-intel's `DegradedReason`. */
export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  /** true when the repo index was missing/partial and the map is best-effort. */
  degraded: z.boolean().optional(),
  reason: BlastDegradedReason.optional(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;

// ---- Risk brief (generated on demand; one model call) ----
/** A place the reviewer should look first. `line` is an integer (strict schema). */
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int(),
  reason: z.string(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

/** What the model returns. Every field is required (strict JSON schema). */
export const BriefModelOutput = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
});
export type BriefModelOutput = z.infer<typeof BriefModelOutput>;

export const BriefMissingInputKind = z.enum([
  'intent_missing',
  'intent_other_sha',
  'blast_degraded',
  'specs_missing',
  'description_empty',
  'issue_not_referenced',
  'issue_unreachable',
  'files_truncated',
  'prompt_trimmed',
]);
export type BriefMissingInputKind = z.infer<typeof BriefMissingInputKind>;

export const BriefMissingInput = z.object({
  kind: BriefMissingInputKind,
  reason: z.string().optional(),
});
export type BriefMissingInput = z.infer<typeof BriefMissingInput>;

/** Stored document (pr_brief.json). Every persisted field is nullish so an
 *  error-only document, or one written before a field existed, still validates. */
export const BriefEnvelope = z.object({
  brief: BriefModelOutput.nullish(),
  intent: Intent.nullish(),
  blast: BlastRadius.nullish(),
  generated_for_sha: z.string().nullish(),
  generated_at: z.string().nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  missing_inputs: z.array(BriefMissingInput).nullish(),
  tokens_in: z.number().nullish(),
  tokens_out: z.number().nullish(),
  cost_usd: z.number().nullish(),
  last_error: z.string().nullish(),
  last_error_at: z.string().nullish(),
});
export type BriefEnvelope = z.infer<typeof BriefEnvelope>;

/** GET /pulls/:id/brief. `generating` and `stale` are computed on read. */
export const BriefResponse = z.object({
  brief: BriefModelOutput.nullable(),
  meta: BriefEnvelope.omit({ brief: true, missing_inputs: true }).nullable(),
  generating: z.boolean(),
  stale: z.boolean(),
  missing_inputs: z.array(BriefMissingInput),
});
export type BriefResponse = z.infer<typeof BriefResponse>;

// ---- File references: `path`, `path:start` or `path:start-end` ----
export interface FileRef {
  path: string;
  start: number | null;
  end: number | null;
}

const FILE_REF_RE = /^(.+):(\d+)(?:-(\d+))?$/;

/** Split a file ref. A suffix that is not a valid 1-based range (zero, or end
 *  before start) is not a range: the whole string stays the path. */
export function parseFileRef(ref: string): FileRef {
  const m = FILE_REF_RE.exec(ref);
  if (!m) return { path: ref, start: null, end: null };
  const start = Number(m[2]);
  const end = m[3] === undefined ? null : Number(m[3]);
  if (!Number.isSafeInteger(start) || start < 1) return { path: ref, start: null, end: null };
  if (end !== null && (!Number.isSafeInteger(end) || end < start)) {
    return { path: ref, start: null, end: null };
  }
  return { path: m[1] as string, start, end: end === start ? null : end };
}

export function formatFileRef(path: string, start?: number | null, end?: number | null): string {
  if (start == null || !Number.isInteger(start) || start < 1) return path;
  if (end == null || !Number.isInteger(end) || end <= start) return `${path}:${start}`;
  return `${path}:${start}-${end}`;
}
