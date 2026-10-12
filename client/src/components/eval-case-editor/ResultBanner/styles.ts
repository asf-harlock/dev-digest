import type { CSSProperties } from "react";

/** Co-located styles for ResultBanner. */
export const s = {
  banner: (color: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
    padding: "8px 12px",
    borderRadius: 7,
    // No `border` shorthand next to a per-side width: React warns when `color` changes.
    borderStyle: "solid",
    borderColor: color,
    borderWidth: "1px 1px 1px 4px",
    background: "var(--bg-surface)",
    fontSize: 13,
  }),
  icon: (color: string): CSSProperties => ({ color, flexShrink: 0 }),
  spin: { flexShrink: 0, color: "var(--info)", animation: "ddspin 1s linear infinite" } satisfies CSSProperties,
  title: {
    fontWeight: 700,
    color: "var(--text-primary)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  stats: { color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
