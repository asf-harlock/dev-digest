import type { CSSProperties } from "react";

export const s = {
  card: (accent: string): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: "16px 18px",
    background: "var(--bg-surface)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderLeftWidth: 3,
    borderLeftColor: accent,
    borderRadius: 8,
  }),
  main: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  name: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", wordBreak: "break-word" } satisfies CSSProperties,
  deletedName: { fontStyle: "italic", color: "var(--text-secondary)" } satisfies CSSProperties,
  summary: { margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)", wordBreak: "break-word" } satisfies CSSProperties,
  side: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
