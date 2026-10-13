import type { CSSProperties } from "react";

export type StepState = "done" | "current" | "todo";

export function stepState(index: number, current: number): StepState {
  return index < current ? "done" : index === current ? "current" : "todo";
}

/** The vendored `ExportWizardSteps` look, with the state kept out of colour alone (NFR-13). */
export function circleStyle(state: StepState): CSSProperties {
  return {
    background: state === "done" ? "var(--ok)" : state === "current" ? "var(--accent)" : "var(--bg-elevated)",
    color: state === "todo" ? "var(--text-muted)" : "#fff",
    borderWidth: state === "todo" ? 1 : 0,
    borderStyle: "solid",
    borderColor: "var(--border-strong)",
  };
}

export function labelStyle(state: StepState): CSSProperties {
  return {
    fontWeight: state === "current" ? 600 : 500,
    color: state === "todo" ? "var(--text-muted)" : "var(--text-primary)",
  };
}

export function lineStyle(state: StepState): CSSProperties {
  return { background: state === "done" ? "var(--ok)" : "var(--border-strong)" };
}
