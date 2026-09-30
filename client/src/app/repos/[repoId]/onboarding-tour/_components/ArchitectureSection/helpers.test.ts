import { describe, it, expect } from "vitest";
import { buildDiagramSource } from "./helpers";

const nodes = [
  { id: "a", label: 'say "hi" <b>', path: "src/a.ts" },
  { id: "b", label: "B", path: "src/b.ts" },
];

describe("buildDiagramSource", () => {
  it("UI-6: quoted, escaped labels and synthetic node ids", () => {
    const src = buildDiagramSource({ nodes, edges: [{ from: "a", to: "b" }] })!;
    expect(src.startsWith("flowchart LR")).toBe(true);
    expect(src).toContain('n0["say #quot;hi#quot; #lt;b#gt;"]');
    expect(src).toContain("n0 --> n1");
  });

  it("AC-5: null without a grounded edge; unknown/duplicate edges are skipped", () => {
    expect(buildDiagramSource({ nodes, edges: [] })).toBeNull();
    expect(buildDiagramSource({ nodes, edges: [{ from: "a", to: "zzz" }] })).toBeNull();
    const src = buildDiagramSource({ nodes, edges: [{ from: "a", to: "b" }, { from: "a", to: "b" }] })!;
    expect(src.match(/-->/g)).toHaveLength(1);
  });
});
