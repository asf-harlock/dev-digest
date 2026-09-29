---
name: spec-authoring
description: >-
  How DevDigest writes and reads Spec-Driven-Development specifications — the
  SPEC-NN files under specs/ and <module>/specs/. Covers the fixed spec
  skeleton, the item formats and stable IDs (US/AC/EC/NFR/Q), EARS with the
  course's Ukrainian triggers КОЛИ/ПОКИ/ЯКЩО/ДЕ and "(shall)", the design
  analysis lenses (missing states, corner cases, cross-module interaction, UX,
  untrusted inputs) and the deterministic lint. Use when writing, revising or
  reviewing a spec, when turning designs into requirements, and when planning
  or verifying against a SPEC-NN file — even if the user only says "write a
  spec", "acceptance criteria", "EARS", "requirements" or "is this spec ready".
---

# Spec authoring

A spec states **what** a feature must do, for whom and under which
conditions — never the file-by-file **how** (that is the Implementation Plan).
Three agents depend on the same format, so it is fixed:

| Who | Uses the spec to |
|---|---|
| `spec-creator` | write it |
| `implementation-planner` | plan against every `AC-n` / `EC-n` / `NFR-n` |
| `plan-verifier` | build one traceability row per ID |

## Read the reference you need

| Task | Read |
|---|---|
| Writing or checking the file layout, headers, item formats, IDs | `reference/template.md` |
| Phrasing a requirement | `reference/ears.md` |
| Analysing a request or a design before writing | `reference/design-lenses.md` |
| Seeing what "good" looks like end to end | `reference/example-spec.md` |

## Non-negotiables

1. The skeleton in `reference/template.md` is exact: headings verbatim, in
   order, none added or removed.
2. Every AC, EC and NFR is **one** EARS sentence with exactly one `(shall)`.
3. IDs are stable. Never renumber; strike a dropped item through instead.
4. Every AC names the `US-n` it serves; every US has at least one AC.
5. No vague words (list in `reference/ears.md`). An untestable requirement is
   an open question, not a requirement.
6. `Status` is written as `draft`. Only the user moves it to `approved`, and
   only the user (usually prompted by `plan-verifier`) to `implemented`.
7. An `approved`/`implemented` spec is never edited — a changed decision is a
   new spec with `Supersedes:`.
8. `specs/01`–`03` predate this format. They have no `Spec ID:` line, the
   lint skips them, and they are left as-is; they still count toward the
   `SPEC-NN` sequence.

## Placement and numbering

| Feature touches | File |
|---|---|
| more than one module | `specs/NN-<kebab-name>.md` |
| only `server/` / `client/` / `reviewer-core/` / `mcp/` | `<module>/specs/NN-<kebab-name>.md` |

`SPEC-NN` is one repo-wide sequence: highest two-digit prefix across all five
directories (`specs/`, `server/specs/`, `client/specs/`, `reviewer-core/specs/`,
`mcp/specs/`), plus one. Filename prefix and Spec ID always match.
`specs/lessons/` (course material) and `e2e/specs/` (`*.flow.json` browser
flows) are never spec locations.

## Lint

```sh
node .claude/skills/spec-authoring/scripts/lint-spec.mjs <spec.md> [...]
node --test .claude/skills/spec-authoring/scripts/lint-spec.test.mjs   # the lint's own tests
```

Errors print as `path:line: message` and exit 1. `/pr-self-review` runs it as
the `spec:lint` gate on every changed `specs/NN-*.md` and
`<module>/specs/NN-*.md` (module = `server`, `client`, `reviewer-core`, `mcp`), so a malformed spec blocks the push like a type
error does. The lint proves **form** only — that a requirement is well-formed
and traceable, not that it is the right requirement.

## Running spec-creator (the caller's side)

`spec-creator` is a subagent: it cannot ask the user, cannot spawn agents and
cannot run shell commands. The main session drives the loop:

1. **Intake.** Launch `spec-creator` with the user's request and every design
   source (screenshot paths, Figma frames exported as PNG — the agent has no
   Figma tools — or "app is running on :3000").
2. **Research fan-out.** If the intake has `Research requests`, launch one
   `researcher` per row **in a single message** so they run in parallel —
   paste the row's question, scope, where-to-look and what it unblocks as the
   researcher's task. At most 4 per round, 2 rounds. Skip this step when the
   table says `None`.
   - **A blocking question is `pending R<n>`** → wait for the reports, resume
     `spec-creator` (SendMessage, same agent) with them verbatim, labelled
     `R1`…`Rn`; it returns a revised intake, and only then go to step 3.
   - **No blocking question is `pending`** → go to step 3 while research
     runs. When the reports arrive, tell the user what they change. If they
     change no finding's priority and no question's default, skip the
     revised-intake round and pass the reports **verbatim** in the step 4
     resume, together with the answers. If they do change one, resume for a
     revised intake first.
3. **Ask the user.** Relay the blocking questions, then the non-blocking ones
   (AskUserQuestion for choices, with the agent's default as the first,
   "(Recommended)" option), and the findings table for keep/drop. Never
   answer on the user's behalf.
4. **Write.** Resume `spec-creator` with the answers; it writes the draft and
   reports its self-check.
5. **Lint.** Run `node .claude/skills/spec-authoring/scripts/lint-spec.mjs
   <path>`. On errors, resume the agent with the output; repeat until `ok`.
6. **Hand back.** Give the user the path and the open questions. Approval
   (`Status: approved`) is the user's edit, then `implementation-planner`.
