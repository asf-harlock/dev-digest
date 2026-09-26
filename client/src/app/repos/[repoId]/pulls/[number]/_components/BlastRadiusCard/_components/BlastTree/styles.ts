import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 6px",
    borderRadius: 6,
    cursor: "pointer",
  } satisfies CSSProperties,
  chevron: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  symbolIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  symbolName: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  callerCount: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  body: {
    marginLeft: 21,
    paddingLeft: 12,
    paddingTop: 4,
    paddingBottom: 10,
    borderLeft: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  callers: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  callerRow: { display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  callerIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  callerText: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 } satisfies CSSProperties,
} as const;
