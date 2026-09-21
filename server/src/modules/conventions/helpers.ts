import { z } from 'zod';
import {
  ConventionCategory,
  type ChatMessage,
  type ConventionCandidate,
  type ConventionDraftGrouping,
  type ConventionExtractionMode,
  type ConventionScan,
  type ConventionStatus,
  type Provider,
  type SkillDraft,
} from '@devdigest/shared';
import type { ConventionRow, RepoConventionScanRow } from '../../db/rows.js';
import { LOCAL_CONVENTION_RULES, type LocalConfigKind } from './constants.js';

/**
 * Pure helpers for the conventions module — the LLM's raw output shape,
 * evidence verification ("grounding" for a sampled-file citation rather than a
 * PR diff), DB row ⇄ DTO mapping, and skill-draft assembly. No I/O.
 */

// ---- What we ask the model for ----------------------------------------------

/**
 * The raw shape asked of the model — no `id`/`scan_id`/`status`/`created_at`;
 * those are server-assigned once a candidate survives `verifyEvidence`.
 */
export const LlmConventionCandidate = z.object({
  category: ConventionCategory,
  rule: z.string().min(1),
  evidence_path: z.string().min(1),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  snippet: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type LlmConventionCandidate = z.infer<typeof LlmConventionCandidate>;

export const LlmConventionExtraction = z.object({
  candidates: z.array(LlmConventionCandidate),
});
export type LlmConventionExtraction = z.infer<typeof LlmConventionExtraction>;

// ---- Prompt assembly ---------------------------------------------------------

export interface SampledFile {
  path: string;
  content: string;
}

const CATEGORY_LIST = ConventionCategory.options.join(', ');

/**
 * Builds the single extraction call's messages. Sample selection is 100% code
 * (`repoIntel.getConventionSamples` + the explicit config-file reader in
 * `service.ts`) — the model only extracts rules from what it's shown, it never
 * picks which files to look at.
 */
export function buildExtractionMessages(sampleFiles: SampledFile[], configFiles: SampledFile[]): ChatMessage[] {
  const system: ChatMessage = {
    role: 'system',
    content:
      'You analyze a sample of a repository\'s source and config files and extract the ' +
      'house coding conventions they reveal. Every candidate MUST cite a real ' +
      'file path from the samples given, plus an exact 1-based start/end line range and ' +
      'a short verbatim snippet copied from those exact lines. Only report conventions you ' +
      'can point to concrete evidence for — do not invent files, lines or code. ' +
      `category must be one of: ${CATEGORY_LIST}.`,
  };

  const renderFile = (f: SampledFile): string => {
    const numbered = f.content
      .split(/\r\n|\n/)
      .map((line, i) => `${i + 1}\t${line}`)
      .join('\n');
    return `<file path="${f.path}">\n${numbered}\n</file>`;
  };

  const sections: string[] = [];
  if (configFiles.length > 0) {
    sections.push('## Config files', ...configFiles.map(renderFile));
  }
  if (sampleFiles.length > 0) {
    sections.push('## Sampled source files', ...sampleFiles.map(renderFile));
  }

  const user: ChatMessage = {
    role: 'user',
    content:
      'Extract candidate coding conventions from the following files (line numbers shown are ' +
      '1-based and tab-separated from the code):\n\n' +
      sections.join('\n\n'),
  };

  return [system, user];
}

// ---- Local (non-AI) extraction ----------------------------------------------

/** Classify a config file's basename against `LOCAL_CONVENTION_RULES`' kinds. */
function localConfigKindOf(path: string): LocalConfigKind | null {
  const base = path.toLowerCase();
  if (base.includes('prettier')) return 'prettier';
  if (base.includes('eslint')) return 'eslint';
  if (base.includes('tsconfig')) return 'tsconfig';
  return null;
}

/**
 * 100%-code counterpart to the LLM extraction: no model call, just
 * `LOCAL_CONVENTION_RULES` matched line-by-line against the sampled config
 * files. Each hit is self-grounded (the evidence IS the line that matched),
 * so confidence is always 1 and `verifyEvidence` on it is a no-op sanity
 * check rather than real verification.
 */
export function extractLocalCandidates(configFiles: SampledFile[]): LlmConventionCandidate[] {
  const out: LlmConventionCandidate[] = [];
  for (const file of configFiles) {
    const kind = localConfigKindOf(file.path);
    if (!kind) continue;
    const lines = file.content.split(/\r\n|\n/);
    for (const ruleDef of LOCAL_CONVENTION_RULES) {
      if (ruleDef.configKind !== kind) continue;
      const lineIndex = lines.findIndex((line) => ruleDef.pattern.test(line));
      if (lineIndex === -1) continue;
      const match = lines[lineIndex]!.match(ruleDef.pattern);
      const rule = match?.[1] ? ruleDef.rule.replace('%s', match[1]) : ruleDef.rule;
      out.push({
        category: ruleDef.category,
        rule,
        evidence_path: file.path,
        start_line: lineIndex + 1,
        end_line: lineIndex + 1,
        snippet: lines[lineIndex]!.trim(),
        confidence: 1,
      });
    }
  }
  return out;
}

// ---- Evidence verification ("grounding" against a sampled file) ------------

export interface EvidenceCheck {
  ok: boolean;
  reason?: string;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Verifies a raw candidate's citation against the files actually sampled for
 * the prompt: the path must be one that was sampled, the line range must fall
 * inside that file, and the cited lines must actually contain (a
 * whitespace-normalized match of) the model's snippet. This is the
 * conventions-module analog of reviewer-core's diff-hunk grounding — there is
 * no PR diff here, so it checks against the sampled file's own content instead.
 */
export function verifyEvidence(
  candidate: LlmConventionCandidate,
  sampledByPath: ReadonlyMap<string, string>,
): EvidenceCheck {
  const content = sampledByPath.get(candidate.evidence_path);
  if (content === undefined) {
    return { ok: false, reason: `${candidate.evidence_path} was not sampled` };
  }
  if (candidate.start_line < 1 || candidate.end_line < candidate.start_line) {
    return { ok: false, reason: 'invalid line range' };
  }
  const lines = content.split(/\r\n|\n/);
  if (candidate.end_line > lines.length) {
    return { ok: false, reason: 'line range exceeds file length' };
  }
  const cited = normalizeWhitespace(lines.slice(candidate.start_line - 1, candidate.end_line).join('\n'));
  const snippet = normalizeWhitespace(candidate.snippet);
  if (cited.length === 0 || snippet.length === 0) {
    return { ok: false, reason: 'empty cited content or snippet' };
  }
  if (!cited.includes(snippet) && !snippet.includes(cited)) {
    return { ok: false, reason: 'snippet does not match the cited lines' };
  }
  return { ok: true };
}

// ---- Row -> DTO mapping ------------------------------------------------------

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    scan_id: row.scanId,
    category: row.category as ConventionCategory,
    rule: row.rule,
    evidence: {
      path: row.evidencePath,
      start_line: row.evidenceStartLine,
      end_line: row.evidenceEndLine,
      snippet: row.evidenceSnippet,
    },
    confidence: row.confidence,
    status: row.status as ConventionStatus,
    created_at: row.createdAt.toISOString(),
  };
}

export function toScanDto(row: RepoConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    sample_file_count: row.sampleFileCount,
    config_file_count: row.configFileCount,
    candidate_count: row.candidateCount,
    mode: row.mode as ConventionExtractionMode,
    provider: row.provider as Provider | null,
    model: row.model,
    created_at: row.createdAt.toISOString(),
  };
}

// ---- Skill-draft assembly (POST .../draft-skills — pure, no DB write) ------

/** Slugify to a skill-name-safe slug (mirrors the skills module's D3 pattern). */
function slugify(input: string): string {
  const ascii = input.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let slug = ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > 64) slug = slug.replace(/-+$/, '').slice(0, 64).replace(/-+$/, '');
  if (slug.length < 2) slug = 'convention';
  return slug;
}

/** Append `-2`, `-3`, … until `base` no longer collides with `used`. */
function dedupeSlug(base: string, used: ReadonlySet<string>): string {
  if (!used.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base.slice(0, 60)}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, 40)}-${Date.now()}`;
}

function evidenceFilesFor(group: ConventionRow[]): string[] {
  return [...new Set(group.map((c) => c.evidencePath))];
}

function draftBody(name: string, group: ConventionRow[], repoFullName: string): string {
  const lines: string[] = [
    `# ${name}`,
    '',
    `House conventions for \`${repoFullName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    '',
  ];
  for (const c of group) {
    lines.push(`## ${slugify(c.rule)}`, c.rule, '');
    lines.push(`Detected in \`${c.evidencePath}:${c.evidenceStartLine}-${c.evidenceEndLine}\`:`, '');
    lines.push('```', c.evidenceSnippet, '```', '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Merge/split accepted candidates into skill drafts, pre-filling the existing
 * create-skill form. Never touches the DB — name collisions against EXISTING
 * skills surface later via `POST /skills`'s normal 409.
 */
export function buildSkillDrafts(
  candidates: ConventionRow[],
  grouping: ConventionDraftGrouping,
  repoFullName: string,
): SkillDraft[] {
  if (candidates.length === 0) return [];

  if (grouping === 'merge') {
    // A single accepted candidate degenerates to exactly that candidate's own
    // rule as the skill (matches the "Create skill" flow when only one
    // candidate is accepted); more than one gets a generic bundle name.
    const name = candidates.length === 1 ? slugify(candidates[0]!.rule) : 'repo-conventions';
    const description =
      candidates.length === 1
        ? candidates[0]!.rule
        : `House conventions merged from ${candidates.length} accepted findings.`;
    return [
      {
        name,
        description,
        type: 'convention',
        body: draftBody(name, candidates, repoFullName),
        evidence_files: evidenceFilesFor(candidates),
      },
    ];
  }

  if (grouping === 'per_candidate') {
    const used = new Set<string>();
    return candidates.map((c) => {
      const name = dedupeSlug(slugify(c.rule), used);
      used.add(name);
      return {
        name,
        description: c.rule,
        type: 'convention' as const,
        body: draftBody(name, [c], repoFullName),
        evidence_files: evidenceFilesFor([c]),
      };
    });
  }

  // per_category
  const byCategory = new Map<string, ConventionRow[]>();
  for (const c of candidates) {
    const arr = byCategory.get(c.category);
    if (arr) arr.push(c);
    else byCategory.set(c.category, [c]);
  }
  return [...byCategory.entries()].map(([category, group]) => {
    const name = `convention-${category.replace(/_/g, '-')}`;
    return {
      name,
      description: `House conventions (${category.replace(/_/g, ' ')}) merged from ${group.length} accepted finding${group.length === 1 ? '' : 's'}.`,
      type: 'convention' as const,
      body: draftBody(name, group, repoFullName),
      evidence_files: evidenceFilesFor(group),
    };
  });
}
