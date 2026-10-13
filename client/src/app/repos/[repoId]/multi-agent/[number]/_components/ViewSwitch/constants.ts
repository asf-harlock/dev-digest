export const VIEW_MODES = ["columns", "tabs"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
