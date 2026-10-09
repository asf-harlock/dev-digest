/**
 * The three ways to run a case. Each composes runtime + artifacts; nothing here talks to the
 * SDK directly.
 *
 *   skillTask / agentTask — inject the artifact's content as system prompt, load NO on-disk
 *     config → measures the artifact's CONTENT in isolation.
 *   workflowTask — load the real on-disk harness (settingSources:["project"]) → measures the
 *     SYSTEMIC effect: does a skill activate, does a subagent dispatch, does CLAUDE.md matter.
 */

import { IS_BASELINE, WORKFLOW_ALLOWED_TOOLS } from "./config.js";
import { runClaude, type RunOptions } from "./runtime/run-claude.js";
import { runContent } from "./runtime/dispatch.js";
import { skillContent, agentContent, agentTools } from "./artifacts/load.js";

/**
 * Run a prompt with a skill's content injected (the 'candidate' condition). Under
 * EVAL_CONFIG=baseline the artifact is NOT injected — that is the benchmark's without-skill
 * baseline, i.e. the raw model, used to measure the skill's lift.
 */
export function skillTask(prompt: string, skillName: string, opts: RunOptions = {}) {
  const systemPrompt = IS_BASELINE ? undefined : skillContent(skillName);
  return runContent(prompt, { ...opts, systemPrompt });
}

/**
 * Run a prompt with a subagent's definition injected as the system prompt (baseline: none).
 *
 * A subagent is a TOOL-USING artifact — its whole method is "read the docs, grep the imports".
 * Running it content-only (no tools) both contradicts its own body ("you have Read/Glob/Grep")
 * and trips runClaude's "you have NO tools" directive, which makes a doc-grounded reviewer refuse
 * or downgrade every finding to `cannot-verify`. So we hand it exactly the tools it declares in
 * frontmatter and let it run from REPO_ROOT (runClaude's default cwd), the way production does.
 * Both conditions (candidate + baseline) get the same tools so the measured lift stays fair.
 *
 * The declared set is passed as `tools` too — `allowedTools` alone only auto-approves, and under
 * bypassPermissions the agent would still reach Bash (it did: every strict trace showed it).
 * Consequence: Bash-based steps such as `pnpm arch` are unavailable here by design, and the agent
 * body must say what to do then.
 */
export function agentTask(prompt: string, agentName: string, opts: RunOptions = {}) {
  const systemPrompt = IS_BASELINE ? undefined : agentContent(agentName);
  const allowedTools = agentTools(agentName);
  return runClaude(prompt, { allowedTools, tools: allowedTools, ...opts, systemPrompt });
}

/**
 * Run a prompt against the REAL on-disk harness (CLAUDE.md + project skills/agents loaded).
 * Use for workflow-level evals: skill activation, subagent dispatch, CLAUDE.md effect.
 * Ignores EVAL_CONFIG — the workflow tier has its own control-vs-treatment design.
 *
 * Safety: the read-only list must go into `tools`, not only `allowedTools`. Under
 * bypassPermissions `allowedTools` merely auto-approves and the SDK default set (Bash/Write/Edit)
 * stays live — the engineering-insights activation case used `Edit` to append a made-up insight to
 * the real server/INSIGHTS.md on every run, and later sessions read it back as repo knowledge.
 */
export function workflowTask(prompt: string, opts: RunOptions = {}) {
  const allowedTools = opts.allowedTools ?? WORKFLOW_ALLOWED_TOOLS;
  return runClaude(prompt, {
    ...opts,
    allowedTools,
    tools: opts.tools ?? allowedTools,
    settingSources: ["project"],
  });
}
