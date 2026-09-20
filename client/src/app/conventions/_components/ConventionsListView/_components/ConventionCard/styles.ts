import type { CSSProperties } from "react";
import type { ConventionStatus } from "@devdigest/shared";

const ACCENT: Record<ConventionStatus, string> = {
  accepted: "var(--ok)",
  rejected: "var(--border-strong)",
  pending: "var(--border)",
};

export const s = {
  card: (status: ConventionStatus): CSSProperties => ({
    borderRadius: 8,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: ACCENT[status],
    background: "var(--bg-elevated)",
    padding: 16,
    opacity: status === "rejected" ? 0.65 : 1,
    transition: "opacity .2s, border-color .12s",
  }),
  row: { display: "flex", alignItems: "flex-start", gap: 16 } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 12,
  } satisfies CSSProperties,
  title: {
    fontSize: 15,
    fontWeight: 700,
    fontStyle: "italic",
  } satisfies CSSProperties,
  actionsColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 8,
    flexShrink: 0,
  } satisfies CSSProperties,
  editRow: { marginTop: 4 } satisfies CSSProperties,
  evidenceBlock: {
    borderRadius: 7,
    border: "1px solid var(--border)",
    overflow: "hidden",
    marginBottom: 14,
  } satisfies CSSProperties,
  evidenceHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    background: "var(--bg-elevated)",
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
} as const;
