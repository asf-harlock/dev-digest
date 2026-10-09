# Examples

Taken from the first real run (2026-10-08, offline, five modules). The `F-nn` ids
and sizes are that run's — yours will differ; the shapes are what matters.

## A finding, and what you do with it

The script says (section 5):

> **F-03** · medium · `UNUSED` · reviewer-core · `tsx` · 20.7 MB · confidence `verify`
> No import, string reference, config mention, script binary or @types link found for `tsx` in `reviewer-core/`.

`verify` means *check before you schedule*. The check was one grep:

```sh
grep -rn "tsx" reviewer-core --include='*.ts' --include='*.mjs' --include='*.json' --include='*.md' \
  --exclude-dir=node_modules --exclude=package-lock.json
```

It found `package.json`, a sentence in `README.md` and a comment in `src/index.ts` —
no script, no import. Only then does it become an item, with the result stated:

| # | Action | Findings | Effect | How | Risk · Effort |
|---|---|---|---|---|---|
| 1 | Remove unused `tsx` from reviewer-core | F-03, F-12 | frees 20.7 MB; the second `esbuild` copy in this module (pulled by `tsx`) goes with it | `npm --prefix reviewer-core uninstall tsx`. Confirmed: mentioned only in `package.json`, README and a comment; scripts are `tsc` / `vitest` | low · S |

Note `F-12` joined the item: two findings, one root cause, one action.

## The same run, wrongly

```
#### P0
- Remove tsx, next and mermaid (about 410 MB saved)
### Advice
- Keep dependencies up to date and remove unused ones.
```

| Mistake | Why it is wrong |
|---|---|
| `next` and `mermaid` under P0 | `HEAVY` reports weight, not waste. `next` is the client's framework, and `mermaid` is lazy-loaded (`@/components/mermaid-diagram`), so it is not in the initial bundle. Both belong under **Info**, with that reason |
| "about 410 MB saved" | A sum the script did not produce — and the three packages have three different effects. Copy figures; `check-report` rejects `410 MB` because it appears nowhere in the generated sections |
| No `F-nn`, no command, no risk | Nothing to trace and nothing to run. Every item cites findings, gives the exact command, and states risk and effort |
| `tsx` scheduled without a check | `tsx` is also the dev runner the **server** uses for reviewer-core's source — a plausible reason to keep it. The grep is what shows reviewer-core itself never runs it |
| "Keep dependencies up to date" | Could be written without opening the report. Advice names a finding or a metric and says how to start |

## A finding that turns out to be Info

> **F-07** · medium · `DUAL_INSTANCE` · server ⇄ reviewer-core · `zod` · confidence `verify`
> server compiles reviewer-core source via alias; that source imports `zod`. It resolves from `reviewer-core/node_modules` while server's own code uses `server/node_modules`.

Checking the consequence — is there an `instanceof` across the boundary? — found
`server/src/app.ts:140`, which already matches `ZodError` by shape with the comment
"`instanceof` can fail across duplicate zod module instances". The risk is
mitigated in the one place it could bite. Result: the finding stays in the report,
the runtime risk goes to **Info** with that file and line as the reason, and a
smaller type-level action (pin `zod` in `tsconfig` `paths`, as `reviewer-core` does)
goes to P2.

## A finding the script got right and you must not soften

If a run reports

> **F-01** · high · `PHANTOM` · reviewer-core · `ws` · imported from `src/server.ts` but not in `package.json`

it is `certain`, it is P0, and it is cited in the `priorities` block — or the checker fails:

```
report.md:114: F-01 (high, PHANTOM) is not addressed in priorities — schedule it, or list it under Info with a reason
```

The only ways out are to schedule it, or to put it under **Info** with a reason
you can defend.
