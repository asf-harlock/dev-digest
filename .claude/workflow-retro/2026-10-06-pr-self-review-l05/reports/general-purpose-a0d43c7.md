## Hand-back 1

{
  "bucket": "workflow-docs",
  "files_reviewed": [
    ".claude/agents/README.md",
    ".claude/agents/implementation-planner.md",
    ".claude/agents/researcher.md",
    ".claude/skills/run-plan/SKILL.md",
    ".claude/skills/workflow-retro/SKILL.md",
    ".claude/skills/workflow-retro/reference/rubric.md",
    ".claude/skills/workflow-retro/scripts/collect.mjs",
    ".claude/workflow-retro/2026-09-29-spec-04-project-context/metrics.json",
    ".claude/workflow-retro/2026-09-29-spec-04-project-context/report.md",
    ".claude/workflow-retro/2026-09-30-spec-05-onboarding-tour/metrics.json",
    ".claude/workflow-retro/2026-09-30-spec-05-onboarding-tour/report.md",
    ".claude/workflow-retro/2026-10-02-spec-07-pr-context/metrics.json",
    ".claude/workflow-retro/2026-10-02-spec-07-pr-context/report.md",
    ".claude/workflow-retro/history.jsonl",
    ".gitignore",
    "CLAUDE.md"
  ],
  "out_of_scope": [],
  "findings": [
    {
      "severity": "WARNING",
      "category": "bug",
      "title": "Deleting researcher.md leaves stale in-repo references and a repo-external dependency",
      "file": ".claude/agents/README.md",
      "start_line": 37,
      "end_line": 40,
      "rationale": "The in-repo `researcher` agent is deleted and the README now says it lives at `~/Downloads/Sites/helpers/claude/agents/researcher.md` and is installed by `fleet setup-claude`. Both of those sit outside this repo, and `fleet` is the PrestaShop fleet tool.\n\nSeveral things still point at the deleted file as if it existed:\n- `.claude/agents/README.md:94` calls `.claude/agents/researcher.md` an \"existing agent, in-repo precedent\".\n- `.claude/agents/README.md:278` still cites `researcher.md (repo)`.\n- `.claude/agents/spec-creator.md:305` and `.claude/agents/brainstorm.md:115` do the same. Those two files are outside my slice.\n\nThe user-level researcher is described as \"tuned for PrestaShop shops\" and preloads the `research-prestashop` and `research-symfony` skills. Its guard hook has no `pnpm`, so it cannot run `pnpm arch`; the README admits this at line 49.\n\n`spec-creator` and `/run-plan` fan research out to `researcher`. Any other clone of this course starter template (student forks, CI, a second machine) has no such agent, and the hook path `$HOME/Downloads/Sites/helpers/...` does not exist there. Per the task note this is the user's own unstaged work, so I am flagging the dangling references and the portability gap, not the decision.",
      "suggestion": "Either keep a thin project-level `researcher.md` that carries the devdigest-specific rules (INSIGHTS.md and specs/ reading, `pnpm arch` allowed), or at least update README lines 94 and 278 and the provenance rows in `spec-creator.md` and `brainstorm.md` to say the precedent is now user-level. State in the README that the repo depends on a machine-local agent.",
      "confidence": 0.7,
      "psr_skill": null
    },
    {
      "severity": "SUGGESTION",
      "category": "security",
      "title": "Committed metrics.json still leaks local username and temp layout",
      "file": ".claude/skills/workflow-retro/scripts/collect.mjs",
      "start_line": 579,
      "end_line": 580,
      "rationale": "The comment says \"metrics.json is committed: the home directory becomes `~`\", but `replaceAll(homedir(), '~')` only matches the literal `/Users/harlock`. I grepped the three committed metrics.json files. `/Users/` and `harlock/` as a path do not appear, but these still do:\n- `-Users-harlock-Downloads-Sites-devdigest` (the slugified project dir) appears in the `transcript` field of all three files.\n- `/private/tmp/claude-501/-Users-harlock-Downloads-Sites-devdigest/<session>/scratchpad/...` appears in `2026-09-30-spec-05-onboarding-tour/metrics.json` lines 1790 and 2222, and in `2026-10-02-spec-07-pr-context/metrics.json` line 1769.\n\nThese expose the OS username, the uid and the checkout location. I found no tokens, `sk-`, `ghp_` or password literals, and no emails. Low impact, but the redaction promise is incomplete for a file that is now committed.",
      "suggestion": "Also redact the slug form (`process.cwd().replace(/[/.]/g, '-')`, which collect.mjs already computes near line 24) and the `/private/tmp/claude-<uid>` or `$TMPDIR` prefix. Or document that only `homedir()` is scrubbed.",
      "confidence": 0.65,
      "psr_skill": null
    },
    {
      "severity": "SUGGESTION",
      "category": "bug",
      "title": "fold candidates ignore the checker-independence rule that merge enforces",
      "file": ".claude/skills/workflow-retro/scripts/collect.mjs",
      "start_line": 443,
      "end_line": 450,
      "rationale": "`isChecker` (lines 413-414) keeps verifiers and reviewers out of `merge` candidates, because they must stay independent of what they check. The `fold` branch has no such exemption. Running `collect.mjs --session 7d88bec8-...` without `--out` emits `fold` candidates for `architecture-reviewer:a33ce72` and `plan-verifier:a0600b7`. The committed spec-07 metrics.json has two `fold architecture-reviewer` candidates.\n\n`rubric.md` (Topology lens) says to reject candidates that break reviewer independence. Yet `2026-10-02-spec-07-pr-context/report.md` accepts \"fold architecture-reviewer:acacd64 into the orchestrator\" (conditionally), which contradicts both the rubric and `/run-plan` Rules (reviewers and verifier are separate read-only agents). The script feeds the judgement noise it already knows is wrong for this agent type.",
      "suggestion": "Apply `isChecker(a)` to the `fold` branch, or emit those candidates with a `checker: true` field. Reword the accepted spec-07 row as \"replace with a deterministic `pnpm arch` rule\" rather than \"fold into the orchestrator\".",
      "confidence": 0.6,
      "psr_skill": null
    },
    {
      "severity": "SUGGESTION",
      "category": "style",
      "title": "Machine-specific shell gotcha added to a shared course-template CLAUDE.md",
      "file": "CLAUDE.md",
      "start_line": 113,
      "end_line": 115,
      "rationale": "This CLAUDE.md describes a course starter template used by many forks, yet the new Gotcha states \"The shell is zsh on macOS ... `sed` is BSD\" as a project fact. Readers on Linux or Windows get wrong guidance. The sentence \"Change code with Edit, not `sed`\" is a personal workflow preference, not a repo fact. The root Gotchas list otherwise contains only repo-behaviour facts (migrations, the shared copies, secrets). Machine-specific rules belong in `~/.claude/CLAUDE.md`, which this author already uses.",
      "suggestion": "Move the zsh/BSD-sed note to the user-global CLAUDE.md. Or, if it stays, phrase it as a portability note: \"quote globs and avoid GNU-only `sed -i` flags (zsh and BSD sed on macOS)\".",
      "confidence": 0.6,
      "psr_skill": null
    }
  ]
}