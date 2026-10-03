# Findings — schema, merge, re-review

## JSON block every reviewer appends

`architecture-reviewer`, `security-reviewer` and the bug reviewer end their
report with one fenced block tagged `findings-json`:

```findings-json
{
  "reviewer": "architecture|security|bug",
  "findings": [
    {
      "severity": "CRITICAL|WARNING|SUGGESTION",
      "title": "one line, under 80 characters",
      "file": "repo-relative path",
      "start_line": 0,
      "end_line": 0,
      "rationale": "why, and the rule / CLAUDE.md line it rests on",
      "suggestion": "the concrete fix, not applied",
      "confidence": 0.0
    }
  ]
}
```

Same fields as `.claude/skills/pr-self-review/reference/subagent-prompt.md`;
severity per `.claude/skills/pr-self-review/reference/severity-rubric.md`.

## `review-round-N.json` (written by the orchestrator)

```json
{
  "round": 1,
  "base_sha": "…",
  "findings": [
    { "id": "A1", "reviewer": "architecture", "severity": "WARNING",
      "title": "…", "file": "…", "start_line": 0, "end_line": 0,
      "rationale": "…", "suggestion": "…", "confidence": 0.9,
      "decision": "fix|skip|defer|null",
      "status": "open|fixed|disputed|carried",
      "note": "implementer's fixed file:line, or its dispute reason" }
  ]
}
```

Merge rules:
- id = reviewer letter (`A` architecture, `S` security, `B` bug) + a number
  that is never reused across rounds (round 2 continues after round 1's
  highest). An id carried into the next round keeps its id.
- Drop `confidence < 0.6`. `confidence < 0.85` caps at WARNING.
- Same file and overlapping lines, same problem from two reviewers → keep one,
  highest severity, note the other reviewer in `rationale`.
- `decision` is set only by the triage step (CRITICAL → `fix` automatically).

## Implementer Fix mode — reply shape

```markdown
| id | status | evidence |
|---|---|---|
| A1 | fixed | server/src/modules/x/service.ts:42 |
| B2 | disputed | the null case is unreachable: router validates at routes.ts:18 |
```

## Re-review prompt (round N+1, one per reviewer that had `fix` items)

```
Re-review, round <N+1>. Your previous findings are in
.claude/sdd/<SPEC>/review-round-<N>.json (ids <list>, reviewer "<r>").
The fix diff is `git diff <round-start-sha>` (plus untracked files the fix
added: <list>).

1. For each of your ids: is it resolved? status fixed | still-open, with
   file:line evidence.
2. New problems: report ONLY ones on lines this fix diff added or changed.
   Anything on code the fix did not touch is out of scope this round — do not
   report it.

Append the findings-json block: still-open ids keep their title with
"(still open: <id>)"; new ones are new findings.
```

"Round-start sha": if nothing is committed between rounds, the orchestrator
saves `git stash create` (a commit object that does not touch the working
tree) at the start of each fix and diffs against it; an empty result means a
clean tree — use `HEAD`. `stash create` does not capture untracked files, so
also save `git ls-files --others --exclude-standard` at round start and pass
the files that are new since then as "untracked files the fix added".
