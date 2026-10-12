import type { CSSProperties } from "react";
import { shared } from "../../../../styles";

export const s = {
  ...shared,
  body: { padding: "18px 24px 24px", outline: "none" } satisfies CSSProperties,
  cards: { display: "flex", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  counts: { fontSize: 13, color: "var(--text-secondary)", margin: "14px 0 0" } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--warn)", margin: "6px 0 0" } satisfies CSSProperties,
  changes: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" } satisfies CSSProperties,
  skillsHeading: { ...shared.sectionTitle, margin: "22px 0 8px" } satisfies CSSProperties,
  skillGroup: { fontSize: 13, margin: "4px 0" } satisfies CSSProperties,
  skillGroupLabel: { fontWeight: 700, marginRight: 6 } satisfies CSSProperties,
  skillName: {
    display: "inline-block",
    margin: "2px 6px 2px 0",
    padding: "1px 8px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    fontSize: 12.5,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;
