## Hand-back 1

## Security review: SPEC-10 Phase A (A1–A18), `986e61f`..working tree plus untracked files

I read the full diff for `server/src/modules/eval/` and the vendored contracts. On the client I read the new editor files, `EvalCaseButton`, `FindingsPanel`, `lib/api.ts` and the hooks. There is one WARNING and no CRITICAL. Nothing was run against a live service. I did not read `~/.devdigest/secrets.json`.

### Findings
| Severity | File:Line | Category | Input → sink | Exploit scenario | Suggestion | Confidence |
|---|---|---|---|---|---|---|
| WARNING | `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:77-81` | A06/A08 integrity (UI-state guard) | Keystroke `a` or `d` with `e.target` = `<body>` → `action.mutate({findingId: shown[focusIdx].id, action})` (accept or dismiss, a server write). | The guard only skips a keystroke whose target is inside `[role="dialog"]`. `Modal` (`client/src/vendor/ui/kit/Modal.tsx`) has no focus trap and nothing in `EditorModal` calls `.focus()`. The "Turn into eval case" button becomes `disabled`/`loading` while the draft loads, so focus drops to `<body>`. Clicking any non-focusable area of the modal (label, banner, backdrop text) does the same. Pressing `a` or `d` then targets `<body>`, passes the guard and accepts or dismisses `shown[focusIdx]`. That finding is not necessarily the one the editor is open for. It also changes the finding's decided state, which seeded the case type. No attacker is needed; this is accidental data corruption, not exploitation. | Make the guard independent of the event target. Skip when a modal is open, for example `document.querySelector('[role="dialog"][aria-modal="true"]')`. Alternatively focus the dialog on open and trap focus. Also skip `SELECT` and `contenteditable` targets (pre-existing gap). | 0.6 |

### Checked, nothing found
- **Tenancy (A01 / EC-29):**
  - `GET /findings/:id/eval-case-draft` and both POST routes call `getContext()` and pass `workspaceId` to `service.draftFromFinding` / `createFromFinding` / `createFromFindingForSkill`.
  - `findingContext` (`server/src/modules/eval/repository.ts:211-257`) filters on `reviews.workspaceId` and `repos.workspaceId`, and the agent left-join is workspace-scoped, so `agentName` cannot leak across workspaces.
  - `findingSkills` (`repository.ts:516-545`) is scoped on reviews, `agent_runs` and `skills`.
  - `getCaseBySourceFinding` is scoped through `ownerCases(workspaceId, …)`, and `skillForEval` is workspace-scoped. A foreign finding id returns 404 before any other branch.
  - `prFiles(ctx.pull.id)` uses an id taken from the already scoped chain.
- **No LLM call on the draft route:** `draftFromFinding` only reads the DB and `git.diff`.
- **Hand-parsed optional body (A08):**
  - `routes.ts:73-83` uses `EvalCaseInput.safeParse(req.body ?? undefined)`. A non-null body that fails parsing throws `ValidationError` (422), so `{}`, `0` and `""` are all rejected.
  - `skill-eval-case` validates through `schema.body` (`SkillEvalCaseRequest`, `input` optional).
- **Mass assignment (A08):** `insertFindingCase` copies named fields only (`name`, `notes`, `input_diff`, `input_meta.title/body`, `expectation`). `workspaceId`, owner and `sourceFindingId` come from the server context. `buildFindingInputMeta` takes `pr_number` and repo from the DB.
- **Zod caps:** name max 80, notes max 2000, title max 200, body max 5000, file max 500, and the expectation title max 200 (new `title` field). `input_diff` is deliberately uncapped in the schema. `freezeCaseInput` calls `exceedsDiffLimit` (204,800 bytes via `Buffer.byteLength`) before any parsing. Fastify's 1 MB body limit sits above that cap, and the client maps a 413 to `frozen_diff_too_large`.
- **Pasted-diff parsing:** the parser is the existing SPEC-09 `pasted-diff.ts`, line-prefix based with no user-built regex or shell. The diff is stored as text and only passed to `freezeFileDiff`.
- **Command injection / SSRF:** none introduced. The change adds no spawn and no outbound `fetch`. `git.diff` is the existing `loadRawDiff` path; it builds `` `${base}...${head}` `` from PR data (`simple-git.ts:123`). That is pre-existing and not made newly reachable by an unauthenticated route, so I did not report it.
- **Expected-output parser (`client/src/components/eval-case-editor/helpers.ts`, `readOnlyObject` / `parseExpectedOutput`):**
  - The 10,000-byte cap is checked before `JSON.parse`, and the parse sits in a try/catch.
  - It requires an array of exactly one plain object.
  - `Object.keys` includes an own `__proto__` key created by `JSON.parse`, so it is rejected as `unknownKey`. `constructor` is rejected the same way.
  - Values are read through `hasOwnProperty`, and only six whitelisted keys are copied into a fresh object. `type` comes from the switch, never from the text.
  - There is no prototype pollution path.
- **XSS (A05):** no `dangerouslySetInnerHTML` and no Markdown in the new editor, banner, `ActualOutputPane` (a read-only `<textarea>`) or `EvalCaseRow`. Text from PRs, findings and the model is rendered as JSX text, textarea values, or JSON-stringified textarea content. Banner text goes through next-intl, which treats parameters as data. The `Link` hrefs (`ownerEvalsTabHref`, the PR link) are built from server UUIDs, so there are no `javascript:` URLs. The finding `rationale`/`suggestion` Markdown at `FindingCard.tsx:91,97` is unchanged and I did not review it.
- **`apiFetchWithStatus` / `postWithStatus` (`lib/api.ts`):** the base is the same `API_BASE` as before, headers are unchanged (content-type only), and nothing is logged. It returns `{status, data}` and adds no secrets.
- **Portal in `EvalCaseButton`:** it only stops click propagation. `findingId` and `pullId` come from server data, and the draft is fetched with `gcTime: 0` so a stale seed is not reused.
- **Secrets / prompt injection:** neither applies. The diff touches no secrets, no `process.env` and no prompt code.

### Already enforced by hard-rules.sh
- None. I did not run the script, and I saw no `sk-…`, `ghp_…`, `AKIA…`, PEM or `process.env` hits in the changed lines I read.

### Not checked
- Phase B, and `pnpm audit` or dependency CVEs.
- `server/INSIGHTS.md` precedent files (`reviews/routes.ts`, `conventions/routes.ts`), and the full `freezeFileDiff` / `frozen-input.ts` internals for ReDoS (pre-existing SPEC-08/09 code, unchanged here).
- Runtime Fastify config such as CORS, and the `FindingCard` Markdown component's sanitisation (pre-existing).

```findings-json
{
  "reviewer": "security",
  "findings": [
    {
      "severity": "WARNING",
      "title": "a/d shortcut guard misses keys when focus is on body behind the modal",
      "file": "client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx",
      "start_line": 77,
      "end_line": 81,
      "rationale": "The guard only skips events whose target is inside [role=\"dialog\"]. Modal has no focus trap or autofocus, and the trigger button is disabled while the draft loads, so focus falls to <body>. A click on a non-focusable part of the modal does the same. A keypress of 'a' or 'd' then passes the guard and calls action.mutate on shown[focusIdx], silently accepting or dismissing a finding (possibly not the one being edited) while the Case Editor is open. This is accidental state corruption, not attacker-driven.",
      "suggestion": "Skip the shortcuts whenever a modal is open (for example document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]') is non-null), or focus the dialog on open and trap focus; also skip SELECT and contenteditable targets.",
      "confidence": 0.6
    }
  ]
}
```

---

## Hand-back 2

## Security re-review, round 2

**S1: fixed.** `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:77-82` now returns early for INPUT, TEXTAREA, SELECT and `isContentEditable` targets. It also returns early whenever `document.querySelector('[role="dialog"][aria-modal="true"]')` matches, whatever has focus. `Modal` renders exactly `role="dialog" aria-modal="true"` (`client/src/vendor/ui/kit/Modal.tsx`), and the Case Editor uses it, so focus falling to `<body>` behind the modal no longer reaches `action.mutate`. I did not review the `FindingsPanel.test.tsx` assertion.

**New problems on the lines these fixes touched: none.**
- **`freezeCaseInput(input, finding?)` (`server/src/modules/eval/service.ts:274-293`):** the request cannot bypass the strict hunk check.
  - `sameLocation` compares `exp.file`, `exp.start_line` and `exp.end_line` against `ctx.finding`. That is the DB row loaded by `findingContext`, which is workspace-scoped.
  - `kind` is taken from `finding.kind` (DB) and is never read from the request body. `EvalExpectationInput` has no `kind` field.
  - The only way a caller gets the looser full-file-kind grounding is to name the finding's own location. The draft route already grounded that location, so the behaviour is intended.
  - Any edited file or line range gets the strict `groundFindings` intersection check, which is the same check as before.
  - `createManualCase` still calls `freezeCaseInput(input)` with no finding, so nothing changes there.
  - The 204,800-byte cap still runs before parsing (`service.ts:275`).
  - The stored case is still written into the caller's own workspace, so there is no cross-workspace effect.
- **`EditorModal.tsx` `takenOwners` (lines 109-113, 229-249):** the href comes from `ownerEvalsTabHref`, built from server-supplied owner kind and UUID, so there is no `javascript:` URL. `takenOwner.name` is passed as a next-intl parameter and rendered as escaped text. No `dangerouslySetInnerHTML`.
- **`EvalCaseButton.tsx`:** the only `href`s are internal `Link`s built from server ids, and there is no raw HTML.
- **`ExpectedOutputPane.tsx:59` (`type="button"`):** purely a UI-correctness fix, no security impact.

```findings-json
{
  "reviewer": "security",
  "findings": []
}
```