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
    border: `1px solid ${color}`,
    borderLeftWidth: 4,
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
