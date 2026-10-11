import type { EvalExpectation } from "@devdigest/shared";
import { formatLineRange } from "@/lib/eval-format";

/** `file:start-end` of a case's expectation. */
export function expectationLocation(e: Pick<EvalExpectation, "file" | "start_line" | "end_line">): string {
  return formatLineRange(e.file, e.start_line, e.end_line);
}

/** `SEVERITY · category` for a `must_find` expectation; the parts that exist, joined. */
export function severityCategoryParts(e: Pick<EvalExpectation, "severity" | "category">): {
  severity: string | null;
  category: string | null;
} {
  return { severity: e.severity ?? null, category: e.category ?? null };
}
