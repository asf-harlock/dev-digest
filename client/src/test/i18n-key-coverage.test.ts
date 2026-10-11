/* i18n-key-coverage.test.ts — NFR-6: every next-intl key the SPEC-09 components use exists
   in messages/en/<namespace>.json. typecheck and lint cannot see keys, and next-intl only
   logs a missing one at render time, so this reads the component sources statically:
   `const t = useTranslations("ns")` binds a variable to a namespace and every `t("a.b")`
   call with a literal key is looked up. A template key (`t(\`a.${x}\`)`) is checked up to
   its first `${` — that prefix must be an object. Hermetic: file reads only. */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(CLIENT, "src");

/** The SPEC-09 surface: shared case editor/row/dialog/state label/trend, both Evals tabs,
 *  the skill editor's run flow and the finding-card skill menu. */
const ROOTS = [
  "components/eval-case-editor",
  "components/eval-case-row",
  "components/delete-case-dialog",
  "components/case-state-label",
  "components/metric-trend",
  "app/agents/[id]/_components/AgentEditor/_components/EvalsTab",
  "app/skills/_components/SkillEditor/_components/EvalsTab",
  "app/skills/_components/SkillEditor/_components/RunDialog",
  "app/skills/_components/SkillEditor/use-skill-eval-flow.ts",
  "app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/SkillEvalMenu",
];

function sourceFiles(rel: string): string[] {
  const abs = path.join(SRC, rel);
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [abs];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const child = path.join(rel, e.name);
    if (e.isDirectory()) return sourceFiles(child);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path.join(SRC, child)] : [];
  });
}

const catalogs = new Map<string, unknown>();
function catalog(ns: string): unknown {
  if (!catalogs.has(ns)) {
    catalogs.set(ns, JSON.parse(fs.readFileSync(path.join(CLIENT, "messages", "en", `${ns}.json`), "utf8")));
  }
  return catalogs.get(ns);
}

function lookup(ns: string, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
    catalog(ns),
  );
}

interface Use { file: string; ns: string; key: string; dynamic: boolean }

function usesIn(file: string): Use[] {
  const code = fs.readFileSync(file, "utf8");
  const out: Use[] = [];
  const binding = /const\s+(\w+)\s*=\s*useTranslations\(\s*["']([\w.]+)["']\s*\)/g;
  for (const m of code.matchAll(binding)) {
    const [, v, ns] = m as unknown as [string, string, string];
    const call = new RegExp(`(?<![\\w.])${v}(?:\\.rich|\\.raw)?\\(\\s*(["'\`])((?:(?!\\1).)*)\\1`, "g");
    for (const c of code.matchAll(call)) {
      const raw = (c as unknown as [string, string, string])[2];
      const cut = raw.indexOf("${");
      if (cut === -1) out.push({ file, ns, key: raw, dynamic: false });
      else out.push({ file, ns, key: raw.slice(0, cut).replace(/\.$/, ""), dynamic: true });
    }
  }
  return out;
}

describe("next-intl key coverage (SPEC-09 NFR-6)", () => {
  const files = ROOTS.flatMap(sourceFiles);
  const uses = files.flatMap(usesIn);

  it("scans the SPEC-09 components and finds their keys", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(uses.length).toBeGreaterThan(80);
    // Spot checks that the scanner sees namespaces and the new trend keys.
    expect(uses.some((u) => u.ns === "eval" && u.key === "trend.tooltip.skill")).toBe(true);
    expect(uses.some((u) => u.ns === "skills" && u.key.startsWith("evals.runDialog"))).toBe(true);
  });

  it("every key used by those components exists in messages/en", () => {
    const missing = uses
      .filter((u) => u.key !== "" && lookup(u.ns, u.key) === undefined)
      .map((u) => `${path.relative(SRC, u.file)}: ${u.ns}.${u.key}${u.dynamic ? ".*" : ""}`);
    expect(missing).toEqual([]);
  });

  it("every literal key resolves to a message string, not to a group of keys", () => {
    const groups = uses
      .filter((u) => !u.dynamic && u.key !== "" && typeof lookup(u.ns, u.key) === "object")
      .map((u) => `${path.relative(SRC, u.file)}: ${u.ns}.${u.key}`);
    expect(groups).toEqual([]);
  });
});
