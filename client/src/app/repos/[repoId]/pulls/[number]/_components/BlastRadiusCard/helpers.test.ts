/* helpers.test.ts — pure-function coverage for statsFor and toMermaid
   (BlastRadiusCard/helpers.ts, WP-T client). No rendering: these are
   framework-free transforms over the BlastRadius contract. */
import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { kindsByName, statsFor, symbolLabel, symbolsWithoutCallers, toMermaid } from "./helpers";

function blast(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [],
    downstream: [],
    summary: "",
    ...overrides,
  };
}

describe("statsFor", () => {
  it("counts every changed symbol (incl. ones excluded from downstream), sums callers flat, and dedupes endpoints/crons across groups", () => {
    const b = blast({
      changed_symbols: [
        { name: "createUser", file: "users.ts", kind: "function" },
        { name: "sendEmail", file: "email.ts", kind: "function" },
        { name: "unusedHelper", file: "helper.ts", kind: "function" }, // 0 callers, excluded from downstream
      ],
      downstream: [
        {
          symbol: "createUser",
          callers: [
            { name: "handler", file: "routes/users.ts", line: 10 },
            { name: "middleware", file: "routes/mw.ts", line: 5 },
          ],
          endpoints_affected: ["GET /users", "POST /users"],
          crons_affected: ["nightly-sync"],
        },
        {
          symbol: "sendEmail",
          callers: [{ name: "worker", file: "jobs/worker.ts", line: 20 }],
          // shares one endpoint and one cron with the group above — must not double count
          endpoints_affected: ["GET /users"],
          crons_affected: ["nightly-sync", "hourly-report"],
        },
      ],
    });

    expect(statsFor(b)).toEqual({
      symbols: 3,
      callers: 3,
      endpoints: 2,
      crons: 2,
    });
  });

  it("returns all zeros for an empty map", () => {
    expect(statsFor(blast())).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
  });
});

describe("toMermaid", () => {
  it("emits a flowchart LR with symbol -> caller -> endpoint edges", () => {
    const b = blast({
      downstream: [
        {
          symbol: "createUser",
          callers: [{ name: "handler", file: "routes/users.ts", line: 10 }],
          endpoints_affected: ["POST /users"],
          crons_affected: [],
        },
      ],
    });
    const out = toMermaid(b);
    const lines = out.split("\n");

    expect(lines[0]).toBe("flowchart LR");
    expect(out).toContain('s0["createUser"]');
    expect(out).toContain('c0["routes/users.ts:10"]');
    expect(out).toContain('e0["POST /users"]');
    expect(out).toContain("s0 --> c0");
    expect(out).toContain("c0 --> e0");
  });

  it("escapes quotes, angle brackets, brackets/parens and other mermaid-breaking characters in a label", () => {
    const b = blast({
      downstream: [
        {
          symbol: 'weird"<sym>(x)[y]{z}#;&',
          callers: [],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
    });
    const out = toMermaid(b);

    expect(out).toContain(
      's0["weird&quot;&lt;sym&gt;&#40;x&#41;&#91;y&#93;&#123;z&#125;&#35;&#59;&amp;"]',
    );
    // the entities this pass just inserted are never re-escaped (no double "&amp;amp;")
    expect(out).not.toContain("&amp;amp;");
    expect(out).not.toContain("&amp;quot;");
  });

  it("dedupes a caller/endpoint reused across groups into one node instead of emitting duplicates", () => {
    const b = blast({
      downstream: [
        {
          symbol: "a",
          callers: [{ name: "shared", file: "x.ts", line: 5 }],
          endpoints_affected: ["GET /shared"],
          crons_affected: [],
        },
        {
          symbol: "b",
          callers: [{ name: "shared", file: "x.ts", line: 5 }],
          endpoints_affected: ["GET /shared"],
          crons_affected: [],
        },
      ],
    });
    const out = toMermaid(b);
    const lines = out.split("\n");

    // one node line per distinct caller/endpoint value, not one per group
    expect(lines.filter((l) => l.includes('["x.ts:5"]'))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('["GET /shared"]'))).toHaveLength(1);
    // but a distinct symbol node per group, each edging into the shared caller node
    expect(lines.filter((l) => /^\s*s\d+\[/.test(l))).toHaveLength(2);
    expect(out).toContain("s0 --> c0");
    expect(out).toContain("s1 --> c0");
  });

  it("returns just the flowchart header when there is no downstream impact", () => {
    expect(toMermaid(blast({ downstream: [] }))).toBe("flowchart LR");
  });
});

describe("symbolLabel / kindsByName", () => {
  it("adds call parens only for function and method kinds", () => {
    expect(symbolLabel("rateLimit", "function")).toBe("rateLimit()");
    expect(symbolLabel("send", "method")).toBe("send()");
    expect(symbolLabel("Mailer", "class")).toBe("Mailer");
    expect(symbolLabel("unknown", undefined)).toBe("unknown");
  });

  it("maps names to the kind of their first declaration", () => {
    const kinds = kindsByName({
      changed_symbols: [
        { name: "a", file: "a.ts", kind: "function" },
        { name: "a", file: "b.ts", kind: "class" },
        { name: "T", file: "t.ts", kind: "type" },
      ],
      downstream: [],
      summary: "",
    });
    expect(kinds.get("a")).toBe("function");
    expect(kinds.get("T")).toBe("type");
  });
});

describe("symbolsWithoutCallers", () => {
  const map: BlastRadius = {
    changed_symbols: [
      { name: "rowsToSettings", file: "h.ts", kind: "function" },
      { name: "SettingsRow", file: "h.ts", kind: "interface" },
      { name: "SettingsRow", file: "other.ts", kind: "interface" },
    ],
    downstream: [
      {
        symbol: "rowsToSettings",
        callers: [{ name: "settingsRoutes", file: "routes.ts", line: 65 }],
        endpoints_affected: ["GET /settings"],
        crons_affected: [],
      },
    ],
    summary: "",
  };

  it("returns changed symbols absent from downstream, deduped by name", () => {
    expect(symbolsWithoutCallers(map)).toEqual([{ name: "SettingsRow", kind: "interface" }]);
  });

  it("adds them to the graph as isolated nodes (no edges)", () => {
    const chart = toMermaid(map);
    expect(chart).toMatch(/s1\["SettingsRow"\]/);
    expect(chart).not.toMatch(/s1 -->/);
  });
});
