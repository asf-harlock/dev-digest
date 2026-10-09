# Prioritisation and advice

The script ranks findings; **you** turn them into actions. Ranking is a sort key,
not a verdict: a finding becomes P0/P1/P2 by the criteria below, after you have
verified it.

## The score (already in `metrics.json`)

```
score = severity weight + size bonus + runtime-path bonus
        high 100 · medium 50 · low 20 · info 5
        size bonus   = min(40, round(15 · log10(1 + MB)))      1 MB→5 · 10 MB→16 · 100 MB→30 · ≥ 400 MB→40
        runtime path = +10 when the package is on the production path
```

Severity dominates size on purpose: a bare `high` (score 100) outranks a 100 MB
`medium` on the runtime path (90). `F-01` is the highest score. Use the order
inside a bucket; do not quote the score in the report.

## Buckets

| Bucket | Means | Default members |
|---|---|---|
| **P0** | Fix before the next merge or release: it breaks correctness, security or a production install | any `high`; `BOUNDARY_BYPASS` from runtime source; `VULN` high/critical on the runtime path; a `PLACEMENT` (devDependency imported from runtime source) in a shipped, non-bundled module; `PHANTOM` in runtime source; `DUAL_INSTANCE` with differing versions |
| **P1** | Worth planning: real cost or real risk, not urgent | `medium`; `BOUNDARY_BYPASS` from tests only; a confirmed `UNUSED` or `PLACEMENT` that frees ≥ 10 MB on the runtime path; a major `CROSS_MODULE_DRIFT`; `DUAL_INSTANCE` on `zod`/`react` |
| **P2** | Hygiene — batch it into one housekeeping change | `low`/`info`; dev-only `MULTI_VERSION`; minor drift; `OUTDATED` without a `VULN`; redundant peer declarations |
| **Info** | Looked at and deliberately kept (the checker calls this tier `Info`) | core-framework `HEAVY`; findings you verified as false positives; documented gotchas (`VENDOR_DRIFT`, the pinned `zod`) |

You may move an item **one** bucket from its default — say why in the item
("↑ P1: it ships in the production image"). Moving a `high` below P0 means it is
**Info** with a reason; the checker rejects a `high` that is simply missing.

Merge findings with one root cause into one action — three `MULTI_VERSION` lines
for `esbuild` are one item: "align `esbuild` via `drizzle-kit`".

## Verifying before you schedule

Every finding with confidence `verify` needs one check, whose result goes in the
item. Cheap checks:

| Finding | Check |
|---|---|
| `UNUSED` | `grep -rn "<pkg>" <module> --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.json' --exclude-dir=node_modules` — a hit in a comment is not a use; look at CI (`.github/workflows`), `scripts/` and `docker-compose.yml` for CLIs |
| `PLACEMENT` (b) | open the files in `usage.files`; is the import type-only or test-only? |
| `MULTI_VERSION` | `pnpm --dir <m> why <pkg>` / `npm --prefix <m> explain <pkg>` — which callers pin which version, and can a range bump unify them? |
| `DUAL_INSTANCE` | is there an `instanceof`, `ZodError` check or shared singleton across the boundary? Does the module's tsconfig/bundler pin the package? |
| `BOUNDARY_BYPASS` | open the importing file: is the path really into a sibling module? Does a tsconfig alias or an entry point already exist for it? |
| `HEAVY` | is a lighter equivalent, a sub-path import or lazy loading available? Is it a core framework? |

## Writing an item

One row per action, in the user's language, with figures **copied** from the report:

| # | Action | Findings | Effect | How | Risk · Effort |
|---|---|---|---|---|---|
| 1 | Remove unused `tsx` from reviewer-core | F-03 | frees 20.7 MB | `npm --prefix reviewer-core uninstall tsx` — confirmed: only mentioned in a comment | low · S |

- **Effect** is a copied figure ("frees 20.7 MB", "removes one duplicate copy") or a
  qualitative effect ("closes a phantom import"). Never a sum you computed.
- **How** is a command the user can run, or a precise edit. Use each module's own
  manager (`pnpm --dir server …` in `server/` and `client/`, `npm --prefix … ` in
  `reviewer-core/`, `e2e/`, `mcp/`). You do not run it.
- **Risk**: `low` (no behaviour change), `med` (behaviour could change; tests cover
  it), `high` (needs a migration or design). **Effort**: `S` (one command), `M`
  (code touched), `L` (needs a plan).

## Project norms every recommendation must respect

- Lockfiles are never hand-edited; the module's manager rewrites them and the
  rewrite is committed with the change.
- `*/src/vendor/**` is vendored — recommend a change there only as "needs an
  explicit request", and a shared-contract change goes into **both** copies in
  one commit.
- There is no root `package.json` and none is to be created; the five modules
  are standalone.
- A new or bumped dependency in a lesson fork is homework, not `main`.

## Advice (the third block)

3–6 bullets of **standing practice** that would stop the findings recurring. Each
bullet is `what — why (F-nn or a metric) — how to start`, and none repeats a
priority item. Draw on:

- **Guard** — a CI step or lint that would have caught it (an unused/phantom check
  on pull requests, a policy that a `devDependency` may not be imported from
  `src/`).
- **Measure** — a number the installed size cannot give (a bundle analyser for
  `client/`, since installed size is not shipped size).
- **Align** — one version policy for packages shared across modules (`zod`,
  `@types/node`, `tsx`).
- **Document** — a decision worth recording through `engineering-insights`.
- **Cadence** — when to re-run (before a release, after adding a dependency).

If a bullet could be written without looking at this report, it is not advice
about this repo — cut it.
