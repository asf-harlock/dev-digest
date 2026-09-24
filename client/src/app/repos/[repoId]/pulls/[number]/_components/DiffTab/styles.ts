import type { CSSProperties } from "react";

export const s = {
  statsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 14,
  } satisfies CSSProperties,
  statsText: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  rightControls: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  /** The Smart order / Original order segmented control — `@devdigest/ui` has
   *  no segmented primitive (root plan step 8), so this is a small local pair
   *  of `aria-pressed` buttons rather than a new vendor component. */
  toggleWrap: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: 2,
    gap: 2,
  } satisfies CSSProperties,
  toggleBtn: (active: boolean): CSSProperties => ({
    border: "none",
    borderRadius: 5,
    padding: "5px 10px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
  }),
  /** Placeholder shown while `useSmartDiff` is loading (Smart order only), so
   *  FileCards don't mount flat then remount grouped once the query resolves. */
  loadingNote: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-muted)",
    padding: 24,
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
} as const;
