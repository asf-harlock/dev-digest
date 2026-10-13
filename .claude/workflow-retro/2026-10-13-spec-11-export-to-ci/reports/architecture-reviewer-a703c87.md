## Hand-back 1

## Architecture review: server/ (modules/ci, adapters/github, adapters/mocks, vendor/shared, skills/repository, platform/config) and client/ (hooks/ci, app/ci-runs, ExportWizard, CiTab, vendor/ui/nav.ts)

Scope: `fe3a37a`..working tree plus untracked files. The change is on disk, so both `pnpm arch` runs cover it.

### Deterministic check results
- `cd server && pnpm arch`: pass. `✔ no dependency violations found (263 modules, 965 dependencies cruised)`. This covers `modules/ci/**` against all 8 rules. Specifically, `no-cross-module-import`, `orm-only-in-repository`, `http-framework-only-in-routes`, `no-concrete-adapter-in-modules`, `no-vendor-sdk-outside-adapters`, `pure-helpers-stay-pure` and `no-circular` are all clean.
- `cd client && pnpm arch`: pass. `✔ no dependency violations found (876 modules, 2854 dependencies cruised)`. `no-private-component-from-outside-app` and `no-cross-route-private-component` are clean. The ExportWizard, CiTab and ci-runs `_components` are not imported from outside their parents.

### Findings
| Gate | Severity | File:Line | Rule | Rationale | Suggestion |
|---|---|---|---|---|---|
| none | WARNING | `client/src/app/ci-runs/_components/CiRunsTable/helpers.ts:8` and `:26`; `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/RunHistory/helpers.ts:4` and `:10` | frontend-ui-architecture, "Where a file goes" step 3 `[Convention]`: used by two or more features, so promote to the shared layer | `formatCost` and `isTrustedJobUrl` are implemented twice, with different logic. `CiRunsTable` has `export function formatCost(costUsd: number \| null \| undefined): string` and delegates to the shared `formatRunCost`. `RunHistory` has `export function formatCost(cost: number \| null): string` and re-implements the toFixed logic. The two `isTrustedJobUrl` versions also differ. `CiRunsTable`'s checks host, https and that the pathname starts with `/<repo>/actions/runs/`. `RunHistory`'s checks only `u.protocol === "https:" && u.hostname === TRUSTED_JOB_HOST`, so the trust rule has already drifted. `plan.md` step 11 only says the formatters live in `CiRunsView/helpers.ts`. Two real consumers now exist, in two routes. | Promote one implementation to a shared module (for example `lib/ci-format`, next to `lib/eval-format` and `lib/github-urls`). Have both routes import it. Keep the stricter repo-scoped `isTrustedJobUrl`. |
| none | WARNING | `server/src/modules/ci/bundle.ts:1` (also `:81`, `:93`) | onion-architecture, "Where a piece of backend code goes" step 2: talking to something outside the process (the filesystem) belongs in an adapter behind a port | `import { readFile, readdir, stat } from 'node:fs/promises';`, and `return readFile(path.join(path.resolve(distDir), ...wanted.split('/')), 'utf8');`. `bundle.ts` is a non-`helpers` module file that reads the `agent-runner/dist` directory on disk and is called from `service.ts`. No dependency-cruiser rule covers `node:*` imports, so no machine gate catches this. Precedent exists (`modules/conventions/service.ts` and `modules/_shared/project-context.ts` also use `node:fs`), so this follows existing practice rather than introducing a new pattern. The cost is that the service tests need real files instead of a swappable port. | Optional. Put dist reading behind a small port such as `RunnerBundleSource` in `vendor/shared/adapters.ts`, with an adapter under `adapters/` and a mock. Otherwise leave it and accept the precedent. Do not copy `bundle.ts` as a pattern. |

### Grounding note
- Both findings are prose-derived with no machine gate, so they are WARNING at most. Neither rule is `[Framework]` or `[House]`, and neither CLAUDE.md line has a dependency-cruiser pattern. Both are confidence about 0.65 to 0.7.
- Item (1), the adapter throwing `AppError` with CI codes. This is not a violation, so there is no finding.
  - Onion rule 7 (`[Convention]`, errors are translated at the ring boundary) and the existing LLM adapters (`ExternalServiceError` in `anthropic.ts` and `openai.ts`) support translating at the adapter boundary.
  - `adapters/` importing `platform/errors.ts` is allowed (L0, from L3).
  - `github_permission` and `rate_limited` are generic GitHub conditions, so they are fine in the adapter.
  - Mild smell, not tied to a documented rule and not reported as a finding. The CI-flavoured codes `artifact_expired` and `artifact_rejected` and the 16 MiB cap policy live in the adapter. They are written as string literals, while `modules/ci/constants.ts` has the typed `CI_ERROR` set. The inward-pointing import is not available, so the two can drift. The port doc comment in `vendor/shared/adapters.ts` promises these codes, which makes them a de facto contract.
- Item (2), `throttle: { onRateLimit: () => false, onSecondaryRateLimit: () => false }` at `octokit.ts:162` in the constructor.
  - It applies to the whole client, so reviews, polling and every other `container.github()` consumer lose Octokit's sleep-and-retry-once on rate limits.
  - The other (unwrapped) methods now fail with the raw Octokit error. Only the new `guarded()` calls translate it.
  - I could not tie this to a documented onion rule (rule 10 is about module slices, not adapter behaviour), so it is not a table row. It is a real cross-feature behaviour change worth flagging to the author.
  - The scope-limited alternative is to leave the client default and rely on `isTransient` excluding rate limits in `guarded()`. That stops the retry layer retrying them. Octokit's own throttle plugin would still sleep, though, so the author must decide whether they want it per call or not at all.
- Item (3), `ci/service.ts` size and the in-memory locks.
  - No rule sets a size limit, and the frontend skill explicitly says no line-count rule has authority. The service stays at 791 lines because `assemble`, `bundle`, `ingest`, `manifest`, `workflow`, `zip`, `mappers` and `pr-body` are split into their own files.
  - The service has no SQL, HTTP or Fastify. `fetch` appears only in `adapters/github/octokit.ts`. `new CiRepository(container.db)` matches onion rule 4's exception because it passes `container.db`.
  - The module-level `Set`s have in-repo precedent (`brief/service.ts` `generating`, `context/service.ts` `syncTails`).
  - `CiService` is constructed once per plugin registration at `routes.ts:59`, so the instance-level locks actually persist across requests. No finding.
  - Caveat only: the locks are per-process. This is documented in the code comment.
- Item (4), `mocks.ts` importing `../platform/errors.js`. Allowed: L3 may import L0 (`platform/errors.ts`), and dependency-cruiser is clean. No finding.
- Item (6), `process.env` outside config. `grep process\.env` over `modules/ci`, `adapters/github` and `adapters/mocks.ts` finds only a doc comment (`bundle.ts:15`). `AGENT_RUNNER_DIST` is read in `platform/config.ts` (rule 9 satisfied). No cross-module imports (the machine gate is green). The `skills/repository.ts` change is a one-line `eq(t.agentRuns.source, 'local')` inside its own repository.
- Item (7), client.
  - No `fetch` or raw API calls in the new components. Only `refetch()` from hooks appears. Data goes through `lib/hooks/ci.ts`, exported via `export * from "./ci"` in `hooks/index.ts`, which matches the existing pattern.
  - `_components` privacy is machine-verified.
  - The `nav.ts` edit adds a single new `GLOBAL` group with one `CI Runs` item. It touches nothing else, and the `Workflow` icon exists in `vendor/ui/icons.tsx`.
  - `*/src/vendor/**` is "Do not touch" in the root CLAUDE.md. The SPEC-11 plan (lines 26 and 137) records explicit user permission for both contract copies, `server/src/vendor/shared/adapters.ts` and `nav.ts` GLOBAL, so no finding.
  - Both `vendor/shared/contracts/eval-ci.ts` copies are modified in this diff. I did not diff-verify them against each other for parity. The new `server/test/ci-contract-parity.test.ts` appears intended to cover that.
- Zero findings on layering direction, tenancy placement, and where the persistence and HTTP code sits.

```findings-json
{
  "reviewer": "architecture",
  "findings": [
    {
      "severity": "WARNING",
      "title": "formatCost/isTrustedJobUrl duplicated across CiRunsTable and RunHistory",
      "file": "client/src/app/ci-runs/_components/CiRunsTable/helpers.ts",
      "start_line": 8,
      "end_line": 26,
      "rationale": "frontend-ui-architecture 'Where a file goes' step 3 [Convention]: code with two or more consumers is promoted to the shared layer. `CiRunsTable/helpers.ts` has `export function formatCost(costUsd: number | null | undefined): string` (delegating to the shared formatRunCost) and a repo-scoped `isTrustedJobUrl(url, repo)`. `CiTab/_components/RunHistory/helpers.ts:4,10` re-implements both (`export function formatCost(cost: number | null): string`, host-only `isTrustedJobUrl`), and the trust rule has already drifted. No machine gate covers this; pnpm arch is clean.",
      "suggestion": "Move one implementation (the stricter repo-scoped isTrustedJobUrl and the formatRunCost-based formatCost) to a shared lib module and import it from both routes; delete the RunHistory copies.",
      "confidence": 0.7
    },
    {
      "severity": "WARNING",
      "title": "Filesystem reads in modules/ci/bundle.ts instead of an adapter",
      "file": "server/src/modules/ci/bundle.ts",
      "start_line": 1,
      "end_line": 93,
      "rationale": "onion-architecture 'Where a piece of backend code goes' step 2: anything that talks to something outside the process (the filesystem) goes in an adapter behind a port in vendor/shared/adapters.ts. `import { readFile, readdir, stat } from 'node:fs/promises';` and `return readFile(path.join(path.resolve(distDir), ...wanted.split('/')), 'utf8');`. No dependency-cruiser pattern covers node:fs imports (prose-only, no machine gate). Existing precedent: conventions/service.ts and _shared/project-context.ts also use node:fs, so this follows prior practice.",
      "suggestion": "Optionally introduce a RunnerBundleSource port (interface in vendor/shared/adapters.ts, adapter under adapters/, mock in mocks.ts, ContainerOverrides field) and have the service take it from the container; otherwise accept the precedent knowingly.",
      "confidence": 0.65
    }
  ]
}
```

---

## Hand-back 2

## Architecture review (round 2): server/ and client/, fix diff only

### Deterministic check results
- `cd server && pnpm arch`: pass. `✔ no dependency violations found (264 modules, 966 dependencies cruised)`.
- `cd client && pnpm arch`: pass. `✔ no dependency violations found (876 modules, 2855 dependencies cruised)`.

### Status per id
- **A1 (shared formatCost/isTrustedJobUrl): resolved.**
  - `client/src/lib/ci-format.ts` holds the single `formatCost` and the repo-scoped `isTrustedJobUrl(url, repo)`.
  - It is a pure kebab-case module next to `lib/eval-format.ts`. It imports only `@/lib/eval-format` and `@/components/run-cost-badge`, both shared-layer, so the shared-to-app direction is respected. This matches frontend-ui-architecture "Where a file goes" step 3.
  - Both callers import it from `@/lib/ci-format`: `CiRunsTable.tsx:14` and `RunHistory.tsx:7`.
  - `RunHistory/helpers.ts` and `RunHistory/helpers.test.ts` are gone, and `TRUSTED_JOB_HOST` and `GITHUB_HOST` no longer appear in the app trees. A grep finds no leftover copies.
  - The weaker host-only trust check no longer exists.
- **A2: skipped by the user, not re-raised.**

### Layering check of the other changed lines
- **`octokit.ts`, second `ciOctokit` client.** It is built only inside the adapter, with the throttle override scoped to the CI methods. `this.octokit` keeps default behaviour for the other features. This removes the cross-feature blast radius I noted as an observation in round 1. There is no layering issue.
- **`ci/service.ts` `refreshInstallation` wrapping errors as `ingest_failed`.** It stays in the service ring, with no SQL, HTTP or fastify. No finding.
- **`ci/errors.ts` `isGithubNotFound` and `ingestFailed`.** It imports only `platform/errors` and its own `constants` and `helpers`. This is the same L2-to-L0 direction as before, so there is no dependency issue. There is one placement nit, reported as A3 below.

### Findings
| Gate | Severity | File:Line | Rule | Rationale | Suggestion |
|---|---|---|---|---|---|
| none | WARNING | `server/src/modules/ci/errors.ts:46` (also `:35`) | onion-architecture, "Where a piece of backend code goes" step 4, "It is a literal -> `constants.ts`. Every literal"; review checklist "Is a literal sitting inline instead of in `constants.ts`?" | `return new AppError('ingest_failed', 'Ingesting the workflow runs failed.', 500);` hard-codes the code, message and status inline. The sibling `ciError(code)` in the same file takes all three from `CI_ERROR_MESSAGE` and `CI_ERROR_STATUS` in `constants.ts`, typed by `CiErrorCode`. `ingest_failed` is not in that table. A grep of `server/src` and `client/src` finds `ingest_failed` only in this line, so it is also outside the shared `CiErrorCode` contract. `const NOT_FOUND_STATUS = 404;` at `:35` is a constant declared in `errors.ts` rather than `constants.ts`. No machine gate covers this (prose only). It is a placement nit, not a dependency problem. | Add `ingest_failed` to `CiErrorCode` in both vendor contract copies and to `CI_ERROR`, `CI_ERROR_MESSAGE` and `CI_ERROR_STATUS` in `constants.ts`, then use `ciError(CI_ERROR.ingestFailed)`. Move `NOT_FOUND_STATUS` to `constants.ts`. |

### Grounding note
- A3 is prose-derived, with no dependency-cruiser pattern for it, and is capped at WARNING. Confidence is about 0.65.
- A1's resolution is verified by direct reading and grep, and by both `pnpm arch` runs passing on the working tree.

```findings-json
{
  "reviewer": "architecture",
  "findings": [
    {
      "severity": "WARNING",
      "title": "ingestFailed() hardcodes code/text/status outside constants.ts",
      "file": "server/src/modules/ci/errors.ts",
      "start_line": 46,
      "end_line": 46,
      "rationale": "onion-architecture 'Where a piece of backend code goes' step 4 (every literal lives in constants.ts) and its review checklist. `return new AppError('ingest_failed', 'Ingesting the workflow runs failed.', 500);` hard-codes the code, message and status, while sibling `ciError()` reads them from CI_ERROR_MESSAGE/CI_ERROR_STATUS typed by CiErrorCode. `ingest_failed` appears nowhere else in server/src or client/src, so it is outside the shared CiErrorCode contract. `const NOT_FOUND_STATUS = 404;` at errors.ts:35 is likewise declared outside constants.ts. Prose-only rule, no machine gate.",
      "suggestion": "Add `ingest_failed` to CiErrorCode in both vendor contract copies and to CI_ERROR/CI_ERROR_MESSAGE/CI_ERROR_STATUS in constants.ts; use ciError(CI_ERROR.ingestFailed). Move NOT_FOUND_STATUS to constants.ts.",
      "confidence": 0.65
    }
  ]
}
```

---

## Hand-back 3

## Architecture review (round 3): fix diff only

### Deterministic check results
- `cd server && pnpm arch`: pass. `✔ no dependency violations found (264 modules, 966 dependencies cruised)`.
- `cd client && pnpm arch`: pass. `✔ no dependency violations found (876 modules, 2855 dependencies cruised)`.

### Status
- **A3 (ingestFailed hard-coded literals): resolved.**
  - `ingestFailed()` in `server/src/modules/ci/errors.ts:43-44` is now `return ciError(CI_ERROR.ingestFailed);`.
  - `server/src/modules/ci/constants.ts` carries `ingestFailed: 'ingest_failed'` (`:152`), the status `500` (`:168`), the message (`:185`) and `HTTP_NOT_FOUND = 404` (`:189`).
  - `isGithubNotFound` uses `HTTP_NOT_FOUND` (`errors.ts:38`). The local `NOT_FOUND_STATUS` is gone, with no other reference left in `server/src` or `client/src`.
  - `ingest_failed` is in `CiErrorCode` in both vendor `eval-ci.ts` copies, in the same list entry at `server:596` and `client:567`. The doc line "`ingest_failed` has no details" is also in both. The two copies are in parity for this change.
  - `errors.ts` imports from `./constants.js` and `platform/errors`, the same inward direction as before.
- A2 and V1 were skipped by the user, so I did not re-raise them.

### New findings
None. The changed lines stay within the module's own ring, with no new cross-ring imports and no inline literals. Both `pnpm arch` runs are green.

```findings-json
{
  "reviewer": "architecture",
  "findings": []
}
```