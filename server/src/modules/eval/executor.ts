import type { EvalRunSnapshot, LLMProvider, PromptAssembly } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { renderSkillBlock } from '../_shared/skill-render.js';
import { CASE_ERROR_FROZEN_DIFF_EMPTY } from './constants.js';
import { evalTaskLine } from './helpers.js';
import type { ScoredFinding } from './scoring.js';

/**
 * SPEC-08 — reviews ONE frozen case. A narrower sibling of the live review
 * path: the same `reviewPullRequest` engine (so prompt assembly, the
 * INJECTION_GUARD, structured-output retries, citation grounding and secret
 * redaction are shared, UI-1), fed only the case's frozen inputs and the run's
 * snapshot (AC-22).
 *
 * DELIBERATELY ABSENT, because a case has no such frozen data: repo-intel
 * (`callers`, `repoMap`), project context, PR context, intent / out-of-scope,
 * memory, specs, session id, cancellation. Nothing here touches the DB, the
 * container, a clone, or any live PR state.
 */

export interface FrozenCaseInput {
  /** The frozen unified diff of the finding's file. */
  inputDiff: string;
  inputMeta: { title: string; body: string | null };
}

export interface CaseReviewResult {
  /** KEPT findings only — those that passed schema validation, grounding and redaction. */
  findings: ScoredFinding[];
  groundingKept: number;
  /** kept + dropped */
  groundingTotal: number;
  /** `null` when the model is missing from the price table. */
  costUsd: number | null;
  durationMs: number;
  /** The assembled prompt; the prompt-identity test compares it across runs. */
  assembly: PromptAssembly;
}

export async function reviewFrozenCase(
  snapshot: EvalRunSnapshot,
  evalCase: FrozenCaseInput,
  llm: LLMProvider,
): Promise<CaseReviewResult> {
  const started = Date.now();
  const diff = parseUnifiedDiff(evalCase.inputDiff);
  // EC-12: nothing to review is an errored case, not an empty pass.
  if (diff.files.length === 0) throw new Error(CASE_ERROR_FROZEN_DIFF_EMPTY);

  const skills = snapshot.skills.map((s) => renderSkillBlock(s));

  const outcome = await reviewPullRequest({
    systemPrompt: snapshot.system_prompt,
    model: snapshot.model,
    diff,
    llm,
    strategy: snapshot.strategy,
    // Omit-when-empty keeps the prompt byte-identical to a skill-less live review.
    ...(skills.length > 0 ? { skills } : {}),
    // Frozen PR body: untrusted, truncated + wrapped by the engine (UI-2).
    ...(evalCase.inputMeta.body ? { prDescription: evalCase.inputMeta.body } : {}),
    // Frozen PR title enters only through the task line (UI-2).
    task: evalTaskLine(evalCase.inputMeta.title),
  });

  const kept = outcome.review.findings;
  return {
    findings: kept.map((f) => ({
      file: f.file,
      start_line: f.start_line,
      end_line: f.end_line,
      title: f.title,
      severity: f.severity,
      category: f.category,
    })),
    groundingKept: kept.length,
    groundingTotal: kept.length + outcome.dropped.length,
    costUsd: outcome.costUsd,
    durationMs: Date.now() - started,
    assembly: outcome.assembly,
  };
}
