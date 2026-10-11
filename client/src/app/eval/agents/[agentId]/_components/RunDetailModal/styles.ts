import type { CSSProperties } from "react";
import { shared } from "../../../../styles";

export const s = {
  ...shared,
  body: { padding: "18px 24px 24px", outline: "none" } satisfies CSSProperties,
  summary: { display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  sectionHeading: { ...shared.sectionTitle, margin: "20px 0 8px" } satisfies CSSProperties,
  settings: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px", fontSize: 13, margin: 0 } satisfies CSSProperties,
  settingKey: { color: "var(--text-secondary)" } satisfies CSSProperties,
  settingVal: { margin: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  list: { margin: 0, padding: 0 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", margin: "10px 0 0" } satisfies CSSProperties,
} as const;
