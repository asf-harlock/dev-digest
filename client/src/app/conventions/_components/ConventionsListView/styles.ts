import type { CSSProperties } from "react";

/** Co-located styles for ConventionsListView — same page shell as
 *  SkillsListView/AgentsListView so the Skills Lab pages read as one system. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 20,
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  loadingStack: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14, marginTop: 16 } satisfies CSSProperties,
} as const;
