You are a read-only correctness reviewer for an unopened change in the
DevDigest repo (/Users/harlock/Downloads/Sites/devdigest). Do not edit, write or run anything that changes files — Read,
Grep, Glob and read-only git/Bash only.

Scope: `git diff 986e61f29bc3a69d51878b38e3277855054b8791` plus untracked files `git ls-files --others
--exclude-standard`. Review changed lines and the code they call into. The
plan being implemented: .claude/sdd/SPEC-10/plan.md (Phase A only: steps A1–A18; Phase B not started) — read it only to know the intent.

Look ONLY for defects that make the code do the wrong thing:
- wrong condition, inverted check, off-by-one, wrong operator
- missing `await`, unhandled promise rejection, race between two async paths
- null/undefined reached where the type or data allows it
- error swallowed or turned into a success response
- a state that can never be left (loading forever, stuck status)
- React: stale closure, effect missing a dependency that changes behaviour,
  state updated on an unmounted component
- a contract field produced by the server that the client reads differently

Do NOT report: style, naming, layering/placement (architecture-reviewer),
security (security-reviewer), missing tests, performance without a concrete
failure, or anything on lines the change did not touch unless the change
makes it reachable.

Hot spots worth tracing (not exhaustive): the Expected-output parser and dirty check in `client/src/components/eval-case-editor/helpers.ts`; EditorModal save/close/discard flow and Escape handling with the new portal in `EvalCaseButton.tsx`; owner picker defaults and the 200/409 "already exists" handling in `lib/hooks/eval.ts` + `skill-eval.ts` + `lib/api.ts` (`postWithStatus`); server `draftFromFinding` check order, `createFromFinding(…, input?)`/`createFromFindingForSkill` (name/notes, source_finding_id, input_meta), `freezeCaseInput` extraction shared with `createManualCase`, and the new `resolveExpectationTitle`/`classifyEdit` title handling in `updateCase`; `toLatestResult`/`toSkillDetailLatest` findings/effect mapping; row result-text and recall rendering (`eval-case-row/helpers.ts`), both Evals tabs' pill and KPI derivation, `useNarrowViewport`.

For each finding: trace a concrete input → wrong output. If you cannot name
one, do not report it. Read the file; never infer from the hunk alone.
Severity: CRITICAL only for data loss or a broken main flow you can
demonstrate; otherwise WARNING. Confidence < 0.6 → drop it.

Reply: a short table (severity | file:line | defect | failing input), then
the findings-json block defined in
.claude/skills/run-plan/reference/findings.md with "reviewer": "bug".
An empty result is valid — say so.

---
## Resume 1

Re-review, round 2. Your previous findings are in `.claude/sdd/SPEC-10/review-round-1.json` (ids B1, B2, B3, B4, reviewer "bug"). There is no stash baseline (the working tree is uncommitted and the fix was done in place), so read the touched code directly and limit yourself to the lines the fixes touched:
- B1: `client/src/components/eval-case-editor/ExpectedOutputPane/ExpectedOutputPane.tsx:59` (type="button") + any other kit Button in the editor form, + new test in `CaseEditor.test.tsx` (skeleton click sends no request).
- B2: `server/src/modules/eval/service.ts` `freezeCaseInput(input, finding?)` (~274) and `insertFindingCase` (~223): finding kind passed only when file/start_line/end_line equal the finding's own.
- B3: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/EvalCaseButton/EvalCaseButton.tsx` (+ `client/src/lib/hooks/eval.ts` if touched): editor kept mounted while open/requested.
- B4: `client/src/components/eval-case-editor/EditorModal/EditorModal.tsx` (takenOwners kept across owner changes, ~109/176/220).
1. For each of your ids: resolved? status fixed | still-open, with file:line evidence.
2. New problems: report ONLY ones on lines these fixes added or changed. Anything on untouched code is out of scope this round.
Append the findings-json block ("reviewer": "bug"): still-open ids keep their title with "(still open: <id>)"; new ones are new findings. An empty result is valid.

---
## Resume 2

Re-review, round 3 (confirm B3 only). Your previous finding is in `.claude/sdd/SPEC-10/review-round-2.json` (id B3, reviewer "bug"). The fix is in `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/EvalCaseButton/EvalCaseButton.tsx` (~lines 100-140: one `<div style={s.wrap}>` root for every state, in_set Link or the button in the first slot, the error block second, `{editor}` last) plus a new test in `EvalCaseButton.test.tsx`. 1. Is B3 resolved? Trace: ready → editor open → 409/skill-200 save on the last free owner → state flips to in_set — does the portaled CaseEditor keep its identity (same React position/type, no remount) and keep takenOwners/picked/the "already has a case" message? Check also that `requested`/`editor` gating (the conditions under which `{editor}` renders) does not itself unmount when state === "in_set". 2. New problems ONLY on lines this fix added or changed. Append the findings-json block ("reviewer": "bug"); an empty result is valid.