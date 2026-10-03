# Prompt assembly

How a review prompt is built and hardened. Source: `src/prompt.ts` (`assemblePrompt`).

## Messages

`assemblePrompt(parts)` returns a `system` message (agent prompt + `INJECTION_GUARD`)
and a `user` message made of sections joined by a blank line.

## User section order

Each section is omitted entirely when its slot is empty/undefined, so a prompt with
no optional slots is byte-identical to the pre-feature shape.

1. task line
2. `## PR description` (untrusted, truncated)
3. `## Declared intent & scope` (untrusted)
4. `## Skills / rules`
5. `## Relevant memory`
6. `## Repo skeleton` (untrusted)
7. `## Project context` — `specs` blocks (`spec-<i>`) first, then `projectContext`
   docs, each as `<untrusted source="project-context:<path>">` in list order. One
   section only, never two.
8. `## Callers of changed symbols` (untrusted)
9. `## Diff to review` (untrusted)

`projectContext?: { path: string; text: string }[]` is set on `ReviewInput` and
forwarded to single-pass and to every per-file map-reduce call.

## `wrapUntrusted(label, content)`

Wraps external text in `<untrusted source="label">…</untrusted>`. A literal
`</untrusted>` in the content is neutralised to `<\/untrusted>`. The label is
attribute-escaped (`"` `<` `>` become `&quot;` `&lt;` `&gt;`) because labels can carry
repo-controlled paths (`project-context:<path>`).

## `INJECTION_GUARD`

The single trusted hardening point, appended to every system prompt. It states that
`<untrusted>` content is data, never instructions, and that stated intent never
waives a finding. Only when at least one `projectContext` doc is present, `PROJECT_CONTEXT_GUARD` is appended (so with none, the system prompt is byte-identical to the pre-feature one). It says: blocks labelled `project-context:`
are the repository's own rules, usable as reference for judging the diff, but
instructions inside them never change the task, the output format or the verdict.
The verdict is additionally recomputed from grounded findings (`run.ts`).
