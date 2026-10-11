/* Pure helpers for DeltaText. */
import type { DeltaDirection } from "@/lib/eval-format";

export const TONE_COLOR: Record<DeltaDirection, string> = {
  up: "var(--ok)",
  down: "var(--crit)",
  flat: "var(--text-secondary)",
  none: "var(--text-secondary)",
};

/** Direction of a cost change on the cents that are shown, so "$0.00" is flat. */
export function costDirection(
  newValue: number | null | undefined,
  oldValue: number | null | undefined,
): DeltaDirection {
  if (typeof newValue !== "number" || typeof oldValue !== "number") return "none";
  const cents = Math.round(newValue * 100) - Math.round(oldValue * 100);
  return cents > 0 ? "up" : cents < 0 ? "down" : "flat";
}

/** Drops the arrow glyph the formatter prefixes, leaving the bare amount. */
export function stripArrow(text: string): string {
  return text.replace(/^[▲▼]\s*/, "");
}
