/**
 * Pure helpers for the PR brief (SPEC-06): file ordering, prompt assembly,
 * grounding, missing-input bookkeeping and staleness. No I/O.
 */
import {
  parseFileRef,
  type BlastRadius,
  type BriefMissingInput,
  type BriefModelOutput,
  type Intent,
  type ReviewFocusItem,
  type Risk,
  type SmartDiffRole,
} from '@devdigest/shared';
import { redactSecrets, wrapUntrusted } from '@devdigest/reviewer-core';
import {
  MAX_BLAST_CALLER_FILES,
  MAX_BLAST_SYMBOLS,
  MAX_DESCRIPTION_CHARS,
  MAX_FILES,
  MAX_FOCUS,
  MAX_INTENT_CHARS,
  MAX_ISSUE_CHARS,
  MAX_RISKS,
  MAX_TITLE_CHARS,
} from './constants.js';

// ---- File ordering (EC-19, trimming) ---------------------------------------

/** `core → wiring → tests → docs → boilerplate`, then path ascending (Q-F). */
const ROLE_RANK: Record<SmartDiffRole, number> = {
  core: 0,
  wiring: 1,
  tests: 2,
  docs: 3,
  boilerplate: 4,
};

export interface BriefFile {
  path: string;
  additions: number;
  deletions: number;
  role: SmartDiffRole;
}

export function orderFiles<T extends { path: string; role: SmartDiffRole }>(files: readonly T[]): T[] {
  return [...files].sort((a, b) => {
    const byRole = ROLE_RANK[a.role] - ROLE_RANK[b.role];
    if (byRole !== 0) return byRole;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}

// ---- Prompt ----------------------------------------------------------------

export interface SpecDoc {
  path: string;
  text: string;
}

export interface BriefPromptInput {
  title: string;
  description: string | null;
  /** `#N title\nbody`, when a linked issue was fetched. */
  issueText: string | null;
  intent: Pick<Intent, 'intent' | 'in_scope' | 'out_of_scope'> | null;
  blast: BlastRadius | null;
  /** Already ordered and capped to `MAX_FILES`. */
  files: readonly BriefFile[];
  /** Rebuilt `@@` headers per file path (see `_shared/hunk-headers.ts`). */
  hunkHeaders: ReadonlyMap<string, readonly string[]>;
  specs: readonly SpecDoc[];
  /** SPEC-07: attached PR-context documents, rendered under `## PR context`. */
  prContext?: readonly SpecDoc[];
  /** Token budget left for the user message (the cap minus the system prompt). */
  budget: number;
  count: (text: string) => number;
}

export interface BriefPrompt {
  text: string;
  tokens: number;
  /** True when hunk headers, caller files or spec documents were dropped to fit. */
  trimmed: boolean;
  /** Paths of PR-context documents the whole-prompt fitter dropped (SPEC-07). */
  droppedPrContext: string[];
}

/** Redact secret-shaped text, cap it, THEN wrap it (F6). */
function wrapText(label: string, raw: string, maxChars: number): string {
  return wrapUntrusted(label, redactSecrets(raw.slice(0, maxChars)).text);
}

/** Distinct caller files of a blast map, in first-seen order. */
export function callerFiles(blast: BlastRadius | null): string[] {
  if (!blast) return [];
  const seen = new Set<string>();
  for (const d of blast.downstream) for (const c of d.callers) seen.add(c.file);
  return [...seen];
}

/** Every file the blast map names: changed-symbol files plus caller files. */
export function blastFiles(blast: BlastRadius | null): string[] {
  if (!blast) return [];
  return [...new Set([...blast.changed_symbols.map((s) => s.file), ...callerFiles(blast)])];
}

interface RenderOptions {
  withHeaders: boolean;
  callerCount: number;
  specCount: number;
  prCount: number;
}

function render(input: BriefPromptInput, opt: RenderOptions): string {
  const sections: string[] = [`## PR title\n${wrapText('title', input.title, MAX_TITLE_CHARS)}`];

  sections.push(
    input.description && input.description.trim().length > 0
      ? `## PR description\n${wrapText('description', input.description, MAX_DESCRIPTION_CHARS)}`
      : '## PR description\n(none provided)',
  );
  if (input.issueText) {
    sections.push(`## Linked issue\n${wrapText('linked-issue', input.issueText, MAX_ISSUE_CHARS)}`);
  }
  if (input.intent) {
    const lines = [input.intent.intent];
    if (input.intent.in_scope.length > 0) lines.push('In scope:', ...input.intent.in_scope.map((s) => `- ${s}`));
    if (input.intent.out_of_scope.length > 0) {
      lines.push('Out of scope:', ...input.intent.out_of_scope.map((s) => `- ${s}`));
    }
    sections.push(`## Intent\n${wrapText('intent', lines.join('\n'), MAX_INTENT_CHARS)}`);
  }
  if (input.blast) {
    const lines = [input.blast.summary];
    const symbols = input.blast.changed_symbols.slice(0, MAX_BLAST_SYMBOLS);
    if (symbols.length > 0) {
      lines.push('Changed symbols:', ...symbols.map((s) => `- ${s.name} (${s.kind}) in ${s.file}`));
    }
    const callers = callerFiles(input.blast).slice(0, opt.callerCount);
    if (callers.length > 0) lines.push('Caller files:', ...callers.map((f) => `- ${f}`));
    sections.push(`## Blast radius\n${wrapText('blast', lines.join('\n'), Number.MAX_SAFE_INTEGER)}`);
  }

  const fileLines = input.files.map((f) => `${f.path} (+${f.additions} -${f.deletions}, ${f.role})`);
  sections.push(
    `## Changed files\n${
      fileLines.length > 0
        ? wrapText('files', fileLines.join('\n'), Number.MAX_SAFE_INTEGER)
        : '(no files)'
    }`,
  );

  if (opt.withHeaders) {
    const lines: string[] = [];
    for (const f of input.files) {
      const headers = input.hunkHeaders.get(f.path);
      if (!headers || headers.length === 0) continue;
      lines.push(`### ${f.path}`, ...headers);
    }
    if (lines.length > 0) {
      sections.push(`## Hunk headers (no code shown)\n${wrapText('hunk-headers', lines.join('\n'), Number.MAX_SAFE_INTEGER)}`);
    }
  }

  const specs = input.specs.slice(0, opt.specCount);
  if (specs.length > 0) {
    sections.push(
      `## Project context\n${specs.map((s) => wrapText(`spec:${s.path}`, s.text, Number.MAX_SAFE_INTEGER)).join('\n\n')}`,
    );
  }
  const prDocs = (input.prContext ?? []).slice(0, opt.prCount);
  if (prDocs.length > 0) {
    sections.push(
      `## PR context\n${prDocs.map((d) => wrapText(`pr-context:${d.path}`, d.text, Number.MAX_SAFE_INTEGER)).join('\n\n')}`,
    );
  }
  return sections.join('\n\n');
}

/**
 * Assemble the user message. Only file stats and rebuilt hunk headers reach
 * it, never a body line (AC-8, NFR-14). When over `budget`, drop in order:
 * hunk headers, then caller files, then spec documents (last one first).
 */
export function buildBriefPrompt(input: BriefPromptInput): BriefPrompt {
  const specs = input.specs.filter((s) => s.text.trim().length > 0);
  const prDocs = (input.prContext ?? []).filter((s) => s.text.trim().length > 0);
  const base: BriefPromptInput = { ...input, specs, prContext: prDocs };
  const opt: RenderOptions = {
    withHeaders: true,
    callerCount: MAX_BLAST_CALLER_FILES,
    specCount: specs.length,
    prCount: prDocs.length,
  };
  let text = render(base, opt);
  let tokens = input.count(text);
  let trimmed = false;
  const step = (change: () => void): boolean => {
    change();
    trimmed = true;
    text = render(base, opt);
    tokens = input.count(text);
    return tokens > input.budget;
  };

  if (tokens > input.budget && opt.withHeaders) {
    step(() => (opt.withHeaders = false));
  }
  if (tokens > input.budget && callerFiles(base.blast).length > 0) {
    step(() => (opt.callerCount = 0));
  }
  while (tokens > input.budget && opt.specCount > 0) {
    step(() => (opt.specCount -= 1));
  }
  // PR context is the author's own attached list: dropped last, last one first.
  while (tokens > input.budget && opt.prCount > 0) {
    step(() => (opt.prCount -= 1));
  }
  return { text, tokens, trimmed, droppedPrContext: prDocs.slice(opt.prCount).map((d) => d.path) };
}

// ---- Grounding (AC-17..AC-19, EC-18, UI-5, UI-6) ---------------------------

export interface GroundingResult {
  brief: BriefModelOutput;
  dropped: { risks: number; refs: number; focus: number };
}

const redact = (s: string): string => redactSecrets(s).text;

/**
 * Keep only references to files of the PR or of the blast map, drop risks left
 * without a reference, dedupe focus items on file+line, cap, and redact the
 * free text. A focus line outside the hunks is kept (D4).
 */
export function groundBrief(output: BriefModelOutput, allowedFiles: ReadonlySet<string>): GroundingResult {
  let droppedRefs = 0;
  let droppedRisks = 0;
  let droppedFocus = 0;

  const risks: Risk[] = [];
  for (const risk of output.risks) {
    const refs = risk.file_refs.filter((ref) => {
      const ok = allowedFiles.has(ref) || allowedFiles.has(parseFileRef(ref).path);
      if (!ok) droppedRefs += 1;
      return ok;
    });
    if (refs.length === 0) {
      droppedRisks += 1;
      continue;
    }
    risks.push({
      kind: redact(risk.kind),
      title: redact(risk.title),
      explanation: redact(risk.explanation),
      severity: risk.severity,
      file_refs: refs,
    });
  }

  const focus: ReviewFocusItem[] = [];
  const seen = new Set<string>();
  for (const item of output.review_focus) {
    const key = `${item.file}\u0000${item.line}`;
    if (!allowedFiles.has(item.file) || seen.has(key)) {
      droppedFocus += 1;
      continue;
    }
    seen.add(key);
    focus.push({ file: item.file, line: item.line, reason: redact(item.reason) });
  }

  const cappedRisks = risks.slice(0, MAX_RISKS);
  const cappedFocus = focus.slice(0, MAX_FOCUS);
  droppedRisks += risks.length - cappedRisks.length;
  droppedFocus += focus.length - cappedFocus.length;

  return {
    brief: { summary: redact(output.summary), risks: cappedRisks, review_focus: cappedFocus },
    dropped: { risks: droppedRisks, refs: droppedRefs, focus: droppedFocus },
  };
}

// ---- Missing inputs (AC-25) and staleness (AC-24, Q-G) ---------------------

export interface MissingInputFacts {
  description: string | null;
  issue: { status: 'none' | 'used' | 'unreachable' };
  intent: { classifiedForSha?: string | undefined } | null;
  headSha: string;
  blast: { degraded?: boolean | undefined; reason?: string | undefined } | null;
  /** Spec documents that are attached and non-empty. */
  specCount: number;
  /** Attached spec documents skipped for the spec token budget. */
  specsOverBudget?: readonly string[];
  totalFiles: number;
  promptTrimmed: boolean;
  /**
   * SPEC-07: set when a PR-context list is attached. `issues` names each
   * truncated / skipped / dropped document with its status; the legacy
   * `specCount` rule is not used in that mode (AC-29..31).
   */
  prContext?: { issues: readonly string[] };
}

export function computeMissingInputs(f: MissingInputFacts): BriefMissingInput[] {
  const out: BriefMissingInput[] = [];
  if (!f.intent) out.push({ kind: 'intent_missing' });
  else if (f.intent.classifiedForSha && f.intent.classifiedForSha !== f.headSha) {
    out.push({ kind: 'intent_other_sha' });
  }
  if (!f.blast) out.push({ kind: 'blast_degraded', reason: 'unavailable' });
  else if (f.blast.degraded) {
    out.push({ kind: 'blast_degraded', ...(f.blast.reason ? { reason: f.blast.reason } : {}) });
  }
  if (f.prContext) {
    if (f.prContext.issues.length > 0) {
      out.push({ kind: 'specs_missing', reason: f.prContext.issues.join(', ') });
    }
  } else if (f.specCount === 0) {
    // Docs were attached but none fit: name them, so the UI does not ask the
    // user to attach what they already attached.
    const skipped = f.specsOverBudget ?? [];
    out.push(skipped.length > 0 ? { kind: 'specs_missing', reason: skipped.join(', ') } : { kind: 'specs_missing' });
  }
  if (!f.description || f.description.trim().length === 0) out.push({ kind: 'description_empty' });
  if (f.issue.status === 'none') out.push({ kind: 'issue_not_referenced' });
  if (f.issue.status === 'unreachable') out.push({ kind: 'issue_unreachable' });
  if (f.totalFiles > MAX_FILES) {
    out.push({ kind: 'files_truncated', reason: `${f.totalFiles} files, first ${MAX_FILES} sent` });
  }
  if (f.promptTrimmed) out.push({ kind: 'prompt_trimmed' });
  return out;
}

/** A null or empty stored SHA is not stale (Q-G). */
export function computeStale(generatedForSha: string | null | undefined, headSha: string): boolean {
  if (!generatedForSha) return false;
  return generatedForSha !== headSha;
}
