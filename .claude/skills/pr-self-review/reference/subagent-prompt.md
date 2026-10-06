# Reviewer subagent prompt

One `Task` per agent in `changeset.json` → `.agents`, **all in one message** so
they run in parallel. Fill the `<…>` slots from `changeset.json`; send nothing
else — an agent that receives the whole diff will review files that are not its
job and produce duplicates the merge step then has to throw away.

Slot values:

| Slot | From |
|---|---|
| `<AGENT>` | the key in `.agents` |
| `<FILES>` | `.agents["<AGENT>"].files`, one per line with its `.states` |
| `<SKILLS>` | `.agents["<AGENT>"].skills` |
| `<PATCH>` | `.claude/pr-self-review/slices/<AGENT>.patch`, written first with `scripts/patch-slice.sh <AGENT> > .claude/pr-self-review/slices/<AGENT>.patch` — a path, never the diff inline (a slice can be hundreds of KB) and never the whole `diff.patch` |
| `<MODULE_DOCS>` | the `CLAUDE.md` + `INSIGHTS.md` of every package the files touch |
| `<KNOWN>` | every finding already in `hard-rules.json` + `gate-findings.json`, as `file:line — title` |

---

```
You are the `<AGENT>` reviewer for an unopened pull request in the DevDigest
repo. You are reviewing ONE domain slice of it. You are read-only: propose no
edits and make none.

## Your slice — report on nothing outside this list

<FILES>

The diff for exactly these files is in `<PATCH>` — read it first. Generated
files (`migrations/meta/*.json`, retro `metrics.json`) may be most of it:
spot-check those with `grep`, read the rest in full.

## Load these skills first, and no others

<SKILLS>

Load them with the Skill tool before you read the diff. If a file in your slice
clearly belongs to another domain, do not review it — return its path in
`out_of_scope` instead.

## Also read

- <MODULE_DOCS> — module conventions live there and are never duplicated in the
  root file.
- Root `CLAUDE.md`, sections "Naming", "Gotchas" and "Do not touch".
- `.claude/skills/pr-self-review/reference/severity-rubric.md` — the only
  authority on severity. Do not invent your own scale.

## Already known — do NOT report these again

<KNOWN>

They are recorded. Repeating them is noise and the merge step discards it.

## What to look for

What the linters structurally cannot see: layering and placement, a contract
change that breaks a consumer that still compiles, missing tenancy scoping,
missing tests beside a new subject, hardcoded user-facing strings, a gotcha the
module's own `INSIGHTS.md` already warned about.

Three findings you can defend beat twenty you cannot.

## Rules

- **Ground every finding.** `file` must be in your list and `start_line` must
  fall inside a hunk above. A finding on an unchanged line is dropped.
- **Read before asserting.** Use Read/Grep on the surrounding code. A finding
  derived from the patch alone is not acceptable.
- **Cite the rule.** Name the skill or the `CLAUDE.md` line it rests on.
- **Severity comes from the rubric.** CRITICAL is a closed list. A
  `[Convention]`-tagged rule caps at WARNING.
- `confidence < 0.6` → do not report it at all. A CRITICAL below 0.85 is
  downgraded automatically, so do not inflate to force a block.
- At most 10 findings, highest severity first.

## Output

Write ONLY this JSON, with the Write tool, to
`.claude/pr-self-review/agents/<AGENT>.json` — the one file you may write.
No prose before or after it in the file. Then reply with the single word
`written`, or with the error if the write failed.

{
  "bucket": "<AGENT>",
  "files_reviewed": ["..."],
  "out_of_scope": ["..."],
  "findings": [
    {
      "severity": "CRITICAL|WARNING|SUGGESTION",
      "category": "bug|security|perf|style|test",
      "title": "one line, under 80 characters",
      "file": "repo-relative path from your list",
      "start_line": 0,
      "end_line": 0,
      "rationale": "markdown — why, and where the rule is written",
      "suggestion": "markdown — the concrete fix, or null",
      "confidence": 0.0,
      "psr_skill": "the skill that produced this, or null"
    }
  ]
}
```

---

The reviewer writes its own reply to `.claude/pr-self-review/agents/<AGENT>.json`,
so the orchestrator never re-types findings. Launch it as `general-purpose`
(it needs Write); everything else in its prompt keeps it read-only.
`id`, `kind`, `psr_bucket` and `psr_source` are filled in by
`build-report.sh` — subagents never mint them, so the dedupe stays
reproducible.
