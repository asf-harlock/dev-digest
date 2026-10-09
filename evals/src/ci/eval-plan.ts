/**
 * Which model-backed evals a change needs — the CI trigger table. Pure: the caller supplies the
 * changed paths and an inventory of what evals exist, so the rules are unit-testable without git
 * or a filesystem. The full `pnpm eval` never runs in CI (too expensive); a change runs only the
 * evals of what it touched, and a touched artifact without evals is skipped with a logged reason.
 *
 *   .claude/skills/<s>/**  or  evals/skills/<s>/**   → skill eval <s>
 *   .claude/agents/<a>.md  or  evals/agents/<a>/**   → agent eval <a> (+ evals that import <a>'s cases)
 *   any CLAUDE.md, evals/workflow/**, .claude/settings.json,
 *   or a skill/agent/doc a workflow case names       → workflow evals
 *   evals/src/** and the rest of the engine          → none here (the free quality job covers it)
 */

export interface AgentEval {
  /** Directory under evals/agents/ — also the agent name it evaluates. */
  dir: string;
  /** Other agent-eval dirs whose cases this one imports (`../<dep>/`). */
  imports: string[];
}

export interface EvalInventory {
  /** Skills that have evals/skills/<s>/<s>.eval.ts. */
  skillEvals: string[];
  agentEvals: AgentEval[];
  /** Concatenated source of evals/workflow/*.cases.ts — searched for quoted names and paths. */
  workflowCasesSource: string;
}

export interface EvalPlan {
  skills: string[];
  agents: string[];
  workflow: boolean;
  /** One line per decision, including skips — printed to the CI log. */
  log: string[];
}

const quoted = (source: string, value: string) =>
  source.includes(`"${value}"`) || source.includes(`'${value}'`);

export function planEvals(changed: string[], inv: EvalInventory, scope: "changed" | "all" = "changed"): EvalPlan {
  if (scope === "all") {
    return {
      skills: [...inv.skillEvals].sort(),
      agents: inv.agentEvals.map((a) => a.dir).sort(),
      workflow: true,
      log: ["scope=all: every skill, agent and workflow eval"],
    };
  }

  const skills = new Set<string>();
  const agents = new Set<string>();
  const log: string[] = [];
  let workflow = false;
  const agentDirs = new Set(inv.agentEvals.map((a) => a.dir));

  const addAgentEvalDir = (dir: string, why: string, casesChanged: boolean) => {
    if (!agentDirs.has(dir)) return;
    if (!agents.has(dir)) log.push(`agent ${dir}: ${why}`);
    agents.add(dir);
    // An eval that reuses another's cases (e.g. a lite variant) must rerun when those CASES change —
    // not when the other agent's prompt does, which the importer never injects.
    if (!casesChanged) return;
    for (const a of inv.agentEvals) {
      if (a.imports.includes(dir) && !agents.has(a.dir)) {
        agents.add(a.dir);
        log.push(`agent ${a.dir}: imports ${dir}'s cases`);
      }
    }
  };
  const markWorkflow = (why: string) => {
    if (!workflow) log.push(`workflow: ${why}`);
    workflow = true;
  };

  for (const file of changed) {
    const parts = file.split("/");

    if (parts[0] === ".claude" && parts[1] === "skills" && parts.length > 3) {
      const s = parts[2]!;
      if (inv.skillEvals.includes(s)) {
        if (!skills.has(s)) log.push(`skill ${s}: ${file}`);
        skills.add(s);
      } else if (!log.includes(`skip skill ${s}: no evals/skills/${s}/${s}.eval.ts`)) {
        log.push(`skip skill ${s}: no evals/skills/${s}/${s}.eval.ts`);
      }
      if (quoted(inv.workflowCasesSource, s)) markWorkflow(`a workflow case names skill ${s}`);
      continue;
    }

    if (parts[0] === ".claude" && parts[1] === "agents" && parts.length === 3 && file.endsWith(".md")) {
      const a = parts[2]!.replace(/\.md$/, "");
      if (agentDirs.has(a)) addAgentEvalDir(a, file, false);
      else if (a !== "README") log.push(`skip agent ${a}: no evals/agents/${a}/`);
      if (quoted(inv.workflowCasesSource, a)) markWorkflow(`a workflow case names agent ${a}`);
      continue;
    }

    if (parts[0] === "evals" && parts[1] === "skills" && parts.length > 3) {
      const s = parts[2]!;
      if (inv.skillEvals.includes(s)) {
        if (!skills.has(s)) log.push(`skill ${s}: ${file}`);
        skills.add(s);
      }
      continue;
    }

    if (parts[0] === "evals" && parts[1] === "agents" && parts.length > 3) {
      addAgentEvalDir(parts[2]!, file, true);
      continue;
    }

    if (parts[parts.length - 1] === "CLAUDE.md") {
      markWorkflow(file);
      continue;
    }
    if ((parts[0] === "evals" && parts[1] === "workflow") || file === ".claude/settings.json") {
      markWorkflow(file);
      continue;
    }
    // A doc that a workflow case anchors on (expectFilesRead / expectFileRead).
    if (quoted(inv.workflowCasesSource, file)) markWorkflow(`a workflow case reads ${file}`);
  }

  return { skills: [...skills].sort(), agents: [...agents].sort(), workflow, log };
}
