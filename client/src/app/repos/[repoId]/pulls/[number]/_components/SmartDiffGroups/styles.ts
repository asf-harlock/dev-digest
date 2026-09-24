import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  group: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    cursor: "pointer",
  } satisfies CSSProperties,
  roleSquare: { width: 10, height: 10, borderRadius: 3, flexShrink: 0 } satisfies CSSProperties,
  roleLabel: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  roleSubtitle: {
    fontSize: 12,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  spacer: { flex: 1, minWidth: 8 } satisfies CSSProperties,
  findingsCount: { fontSize: 12.5, fontWeight: 700, color: "var(--crit)", flexShrink: 0 } satisfies CSSProperties,
  fileCount: { fontSize: 12.5, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  groupBody: { borderTop: "1px solid var(--border)", padding: 10 } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the group is open — same convention as
 *  `diff-viewer/styles.ts`'s `chevronFor`. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}
