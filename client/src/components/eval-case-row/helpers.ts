import type { EvalExpectation } from "@devdigest/shared";
import type { EvalCaseState } from "@/lib/eval-format";

/** `SEVERITY · category` of a `must_find` case; the parts that exist, joined. Null for a
 *  `must_not_flag` case and for a case with neither part (AC-29: the tag is omitted). */
export function severityCategoryTag(e: Pick<EvalExpectation, "type" | "severity" | "category">): string | null {
  if (e.type !== "must_find") return null;
  const tag = [e.severity, e.category].filter(Boolean).join(" · ");
  return tag === "" ? null : tag;
}

/** The recall shown beside a `must_find` result: 100 for a passed case, 0 for a failed one
 *  (AC-30). Null for a `must_not_flag` case and for a state with no verdict. */
export function recallPercent(type: EvalExpectation["type"], state: EvalCaseState): 100 | 0 | null {
  if (type !== "must_find") return null;
  if (state === "passed") return 100;
  if (state === "failed") return 0;
  return null;
}
