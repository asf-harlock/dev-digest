## Hand-back 1

## Architecture review: SPEC-08 eval pipeline (server/, client/, vendor/shared contracts, vendor/ui/nav.ts)

### Deterministic check results
- `cd server && pnpm arch` — pass: "no dependency violations found (231 modules, 811 dependencies cruised)". It ran on the working tree, which contains the whole change (tracked diff against 13a8392 plus untracked files), so it covers the new `src/modules/eval/**`, `_shared/skill-render.ts`, the agents repository/service hook, `platform/container.ts` and `app.ts`.
- `cd client && pnpm arch` — pass: "no dependency violations found (715 modules, 2244 dependencies cruised)". It covers the new `app/eval/**`, `EvalsTab`, `FindingCard/_components/EvalCaseButton`, `lib/hooks/eval.ts` and `lib/eval-format.ts`.
- `reviewer-core/` and `e2e/` are not touched, so no check applies to them.

### Findings
| Gate | Severity | File:Line | Rule | Rationale | Suggestion |
|---|---|---|---|---|---|
| none | none | none | none | Zero findings. Each item you flagged was checked and is conformant (see Grounding note). | none |

### Grounding note
No findings, so nothing rests on prose alone. For each item you flagged, this is what was checked and where the evidence comes from.

**Machine-gated (`pnpm arch` green):**
- **`modules/eval` importing other modules** (`no-cross-module-import`).
  - Eval imports only `../_shared/*` (`skill-render.ts`, `context.ts`, `schemas.ts`), `../../adapters/git/diff-parser.js`, `../../db/*`, `../../platform/*` and `@devdigest/reviewer-core`.
  - `diff-parser` is on the config's `PURE_ADAPTER_FNS` allowlist.
  - Cross-slice access goes through the container: `this.container.agentsRepo.*` in `eval/service.ts`, and `this.container.evalRepo.deleteByAgent(...)` in `agents/service.ts`. That is onion rule 10 as written.
  - `agents/repository.ts` exports its own `DbTx` type, and `eval/repository.ts` declares its own. Neither imports the other, so no cross-module crossing.
- **`ORM_DEBT` and Drizzle placement** (`orm-only-in-repository`).
  - The `ORM_DEBT` allowlist was not extended. `git diff` shows no change to `.dependency-cruiser.cjs`.
  - `drizzle-orm` and `db/schema` are imported only in `eval/repository.ts`, plus the existing `agents/repository.ts`.
  - The `sql` template tags (`jsonb_array_length(...)` at `eval/repository.ts:37-38`) are inside a repository, which is allowed. There is no `sql.raw`, and none in the service, helpers or routes.
- **`helpers.ts` purity** (`pure-helpers-stay-pure`).
  - `eval/helpers.ts` imports only `@devdigest/shared`, the row types from `db/rows.js`, `platform/errors.js`, `./constants.js` and `./types.js`. All of those are permitted for L0.
  - A grep of the pure files (`helpers.ts`, `scoring.ts`, `prompt-diff.ts`, `skills-diff.ts`, `frozen-input.ts`) found no `process.env`, `fs`, `fetch` or randomness. The only clock use is `Date.now()` in `executor.ts`, which is a service-ring file, not `helpers.ts`.
- **Service importing db.** `eval/service.ts` imports only the `type { EvalRepository }`, `type { Container }` and `platform/errors`. There is no `db/schema`, `db/client` or drizzle import.
- **Fastify types stay in routes** (`http-framework-only-in-routes`). Only `eval/routes.ts` imports `fastify`.
- **Shared to route imports in the client** (`shared-does-not-import-app`, `no-cross-route-private-component`, `vendor-is-self-contained`).
  - `lib/eval-format.ts` imports only `@devdigest/shared`. `lib/hooks/eval.ts` imports only `../api`, `react`, tanstack and shared types.
  - Nothing outside `app/eval` imports `app/eval/**`.
  - `FindingsPanel` imports `lib/hooks/eval`, which points inward as the rules require.

**Prose only (no machine gate covers these):**
- **Container getter pattern.**
  - `get evalRepo()` uses `this._evalRepo ??= new EvalRepository(this.db)`, the same shape as `agentsRepo` and `reviewRepo`.
  - Onion "Ports and the container" lists `agentsRepo` as a sync getter, and a `ContainerOverrides` field is required only for a port with an external dependency. A repository does not need one.
  - `new EvalService(container)` in `app.ts` (L4) follows the existing `ReviewService` precedent.
- **Route shape (onion rules 6 and 8).**
  - Every handler in `eval/routes.ts` is `getContext` → schema → one service call.
  - There is no hand-rolled `Schema.parse`, and the `EvalCompareQuery` schema covers the querystring.
- **Rule 4 repository construction.** `eval/service.ts` takes `container.evalRepo` rather than building the repository itself.
- **`app/eval/hooks.ts` beside routes.**
  - It holds `useModalA11y`, a UI-only hook with no fetch. It is consumed only by `RunDetailModal` and `CompareModal`, both under `app/eval/`.
  - The `frontend-ui-architecture` "Where a file goes" rule 2 says single-route code colocates in the route folder. `app/skills/` already keeps route-level `constants.ts` and `helpers.ts` the same way.
  - The data hooks live in `lib/hooks/eval.ts`, so the `client/CLAUDE.md` rule that data access goes through `lib/hooks/*` is respected.
- **Component folder conventions.** I did not inspect every new folder against `client/docs/component-conventions.md`. The new folders sampled (`MetricBar`, `GapSparkline`, `MetricTrend`) are PascalCase with `<Name>.tsx` and `index.ts`, and use `styles.ts`, `constants.ts` and `helpers.ts` as needed.
- **Hand-rolled charts vs the kit** (`client/CLAUDE.md`, "do not write a generic chart that already exists in `@devdigest/ui`").
  - `MetricTrend` is a hand-drawn SVG, and its header comment justifies it. I confirmed in `vendor/ui/charts/LineChart.tsx` that the kit chart coerces a missing value to 0 (`s.data[i] ?? 0`) and defaults the y-range to 0.6 to 1.0. That justification is accurate.
  - `GapSparkline` reuses the kit `Sparkline` for gap-free series.
  - `MetricBar` (a label-less bar plus percent, with null handling) is a small near-duplicate of the kit `BarRow`. I rated it under 0.6 confidence as a rule violation, so it is not reported.
- **`run-executor.ts` is on `ORM_DEBT`.** The change there is a one-line swap to `renderSkillBlock(s)`, which is a pure refactor. It adds no DB access and no new behaviour, so the "pay the debt first" instruction does not apply.
- **Contract parity.** The changes to `knowledge.ts` are identical in both `vendor/shared` copies. The `eval-ci.ts` changes differ only in an import line, because the two copies had already drifted on `CiFailOn` and `AgentManifest` (the drift is not part of this diff). `vendor/ui/nav.ts` has the one authorised line.

```findings-json
{
  "reviewer": "architecture",
  "findings": []
}
```