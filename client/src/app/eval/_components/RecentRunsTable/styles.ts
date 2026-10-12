import type { CSSProperties } from "react";
import { shared } from "../../styles";

export const s = {
  ...shared,
  mono: { fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
  agentName: {
    ...shared.ellipsis,
    fontWeight: 600,
    color: "var(--text-primary)",
    textDecoration: "none",
    minHeight: 24,
  } satisfies CSSProperties,
  pass: { fontWeight: 700, whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
