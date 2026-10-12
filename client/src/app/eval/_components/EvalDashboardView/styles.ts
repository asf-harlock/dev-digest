import type { CSSProperties } from "react";
import { shared } from "../../styles";

export const s = {
  ...shared,
  header: { marginBottom: 24 } satisfies CSSProperties,
  section: { marginTop: 28 } satisfies CSSProperties,
  sectionHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0 } satisfies CSSProperties,
  empty: {
    padding: "28px 18px",
    textAlign: "center",
    color: "var(--text-secondary)",
    fontSize: 14,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
  } satisfies CSSProperties,
} as const;
