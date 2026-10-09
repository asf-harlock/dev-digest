/**
 * eval:ci-plan — print which model-backed evals a change needs (see src/ci/eval-plan.ts for the
 * rules). Reads the inventory from disk and the changed paths from git, so CI and a local check
 * give the same answer:
 *
 *   pnpm eval:ci-plan                     # diff vs origin/main
 *   pnpm eval:ci-plan --base <sha>        # diff <sha>...HEAD (what CI passes)
 *   pnpm eval:ci-plan --all               # every eval
 *
 * Under GitHub Actions it also writes `skills`, `agents` (JSON arrays) and `workflow` (true|false)
 * to $GITHUB_OUTPUT for the job matrices.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EVALS_DIR, REPO_ROOT } from "./artifacts/paths.js";
import { planEvals, type AgentEval, type EvalInventory } from "./ci/eval-plan.js";

// Names end up in CI matrix legs and file paths; a PR controls them, so allow only plain slugs.
const SAFE_NAME = /^[a-z0-9][a-z0-9-]*$/;

function inventory(): EvalInventory {
  const dirs = (p: string) =>
    existsSync(p)
      ? readdirSync(p, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .filter((n) => {
            if (SAFE_NAME.test(n)) return true;
            console.log(`  skip ${p}/${JSON.stringify(n)}: not a plain kebab-case name`);
            return false;
          })
      : [];

  const skillsRoot = join(EVALS_DIR, "skills");
  const skillEvals = dirs(skillsRoot).filter((s) => existsSync(join(skillsRoot, s, `${s}.eval.ts`)));

  const agentsRoot = join(EVALS_DIR, "agents");
  const agentEvals: AgentEval[] = dirs(agentsRoot).flatMap((dir) => {
    const files = readdirSync(join(agentsRoot, dir)).filter((f) => f.endsWith(".eval.ts"));
    if (files.length === 0) return [];
    const src = files.map((f) => readFileSync(join(agentsRoot, dir, f), "utf8")).join("\n");
    const imports = [...src.matchAll(/from\s+["']\.\.\/([^/"']+)\//g)].map((m) => m[1]!).filter((d) => d !== dir);
    return [{ dir, imports }];
  });

  const wfRoot = join(EVALS_DIR, "workflow");
  const workflowCasesSource = existsSync(wfRoot)
    ? readdirSync(wfRoot)
        .filter((f) => f.endsWith(".ts"))
        .map((f) => readFileSync(join(wfRoot, f), "utf8"))
        .join("\n")
    : "";

  return { skillEvals, agentEvals, workflowCasesSource };
}

function changedFiles(base: string): string[] {
  const out = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: REPO_ROOT, encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

function main(): void {
  const argv = process.argv.slice(2);
  const all = argv.includes("--all");
  const i = argv.indexOf("--base");
  const base = i >= 0 ? argv[i + 1]! : "origin/main";

  const plan = planEvals(all ? [] : changedFiles(base), inventory(), all ? "all" : "changed");

  for (const line of plan.log) console.log(`  ${line}`);
  if (plan.log.length === 0) console.log("  no artifact with evals changed — nothing to run");
  console.log(`skills=${JSON.stringify(plan.skills)} agents=${JSON.stringify(plan.agents)} workflow=${plan.workflow}`);

  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    appendFileSync(
      out,
      `skills=${JSON.stringify(plan.skills)}\nagents=${JSON.stringify(plan.agents)}\nworkflow=${plan.workflow}\n`,
    );
  }
}

main();
