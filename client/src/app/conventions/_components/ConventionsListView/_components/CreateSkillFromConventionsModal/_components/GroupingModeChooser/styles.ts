import type { CSSProperties } from "react";

export const s = {
  title: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 } satisfies CSSProperties,
  options: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 } satisfies CSSProperties,
  option: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", paddingLeft: 4 } satisfies CSSProperties,
} as const;
