import type { TourFirstTask } from "@devdigest/shared";

type Complexity = NonNullable<TourFirstTask["complexity"]>;

/** Text colour of the complexity badge per level (mockup: green / amber / red on an outlined chip). */
export const COMPLEXITY_COLOR: Record<Complexity, string> = {
  low: "var(--ok)",
  medium: "var(--warn)",
  high: "var(--crit)",
};
