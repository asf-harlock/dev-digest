Phase 1 (requirements review + clarifying questions) for SPEC-07 "PR Context".

The spec is NOT in the working tree. It lives on branch `docs/spec-07-pr-context`; read it with:
  git show docs/spec-07-pr-context:specs/07-pr-context.md
Status: approved. It partially supersedes SPEC-06 (D5, AC-7, EC-13, EC-26), SPEC-04 (two Non-goals) and SPEC-03 (D1) — those specs are in the working tree under specs/ (06-pr-brief.md, 04-project-context.md, 03-intent-layer.md), with SPEC-06's plan at specs/06-pr-brief.plan.md as a format reference.

Plan against the current working tree, branch `L05-homework` (HEAD 896f72b) — the spec's file:line references are anchored to this branch, and SPEC-06 (PR brief) is already implemented here. If any file:line reference in the spec no longer matches the code, list it.

Follow your normal two-phase process: this reply is the requirements review plus numbered questions, including the single-agent vs multi-agent execution question. Keep the reply concise. Do not write any files.

---
## Resume 1

User's answers:
1. Multi-agent, in your proposed waves (W1 contracts → W2a, W2c, W2d in parallel; W2b after W2a → test-writer → reviewers).
2. (a) — hardened wrapUntrusted only for pr-context: blocks; EC-12 stays byte-identical.
3. Yes — the reviewer-core prompt.ts change (PR-context section, guard sentence, PromptParts field) is approved.
4. Yes — SPEC-07 hunks identical in both vendor copies; pre-existing drift left alone.
5–8. All your stated assumptions/defaults accepted (5a/b/c, 6 non-null fingerprint, 7 last-completed-save-wins with no lock, 8 Q-1/Q-3/Q-5 defaults with fork-PR check listed as unverified risk; Q-2/Q-4 defaults).

Now write the full Implementation Plan (Phase 2). Re-read the module CLAUDE.md/INSIGHTS.md and routing.json as your process requires. Include an Execution table (workstream, agent, files owned, depends on) and a Test plan listing gates as `./scripts/check.sh <pkg> <gate>`. Return the plan as your final message only — do not write files.