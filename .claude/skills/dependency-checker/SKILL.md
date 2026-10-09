---
name: dependency-checker
description: >-
  Audits the dependencies of this repo and of each of its modules (server/,
  client/, reviewer-core/, e2e/, mcp/, evals/): what is declared and installed,
  how much each package weighs, how our own modules depend on one another
  (internal links) versus on npm packages (external), and which declarations are
  unused, phantom, misplaced, duplicated, drifting or bypass a module boundary.
  Produces ONE structured report with fixed sections — Scope, a Mermaid
  dependency graph, a size breakdown, Findings & Priorities (P0/P1/P2/Info) and
  a Summary of 3-5 takeaways. Read-only: it recommends, it never installs,
  removes or edits anything. Use when the user types /dependency-checker, or asks
  to "check/analyse/audit dependencies", "what is heavy in node_modules",
  "unused or duplicated packages", "dependency graph", "перевір залежності",
  "що найважче", "зайві пакети", "схема залежностей" (authored here, not vendored).
argument-hint: "[module,module…] [--online] [--top N]"
---

# /dependency-checker

One report, one fixed structure, whatever the mode. Numbers and diagrams are
facts (a script produces them, or you copy them from data you were given);
priorities and advice are your judgement, and every one of them points at a
named package and a file. This skill answers **what the repo depends on and what
it costs** — it does not decide architecture, audit code for vulnerabilities, or
change anything.

## Two modes, one output

| Mode | When | How the facts arrive |
|---|---|---|
| **A — scripted** (default in this repo) | you have a shell and the modules are installed | `scripts/collect.mjs` measures sizes, draws the diagrams and ranks the findings; you write the judgement blocks (Steps 1–5 below) |
| **B — manual** | the prompt already supplies the data (package.json contents, `du` sizes, grep results), or you have no tools | you build the same report by hand from **only** what you were given (see "Mode B") |

In both modes the report has exactly the five sections below.

## The report contract

Headings are verbatim, in this order, and **Summary is last**. Write the report
in the user's language; package names, file paths, commands and the headings
below stay in English.

| `##` section | Contains |
|---|---|
| **Scope** | which modules were analysed (name, manager, lockfile), the mode, what was checked and what was **not** (offline → vulnerabilities / outdated / deprecations), how size was measured |
| **Dependency graph** | a fenced ```` ```mermaid ```` `flowchart` that separates **internal** links (our modules → our modules) from **external** npm packages; a table of internal links; a table of external packages shared by several modules with each module's version |
| **Size breakdown** | a table of packages with **installed size** (never a vague statement), per module, heaviest first, plus the module totals |
| **Findings & Priorities** | `### Ranked findings`, then `### Priorities` with four tiers `#### P0`, `#### P1`, `#### P2`, `#### Info`, then `### Advice` |
| **Summary** | a one-line verdict, then **3–5 numbered takeaways, ordered by priority**, each concrete and actionable; and what was not checked |

### Severity tiers

| Tier | Meaning | Typical members |
|---|---|---|
| **P0** | breaks correctness, security or a production install — fix before the next merge | a relative import that reaches into a sibling module (bypassing its alias / public entry point); a package imported but not declared; a devDependency imported from runtime source; two copies of one package with **different versions** on a shared boundary; a high/critical advisory |
| **P1** | real cost or real risk, planned work | a confirmed unused dependency that frees ≥ 10 MB; a major-version drift of one package across modules; `zod`/`react` loaded twice |
| **P2** | hygiene, batch it | unused small packages, dev-only duplicate versions, minor drift, outdated majors without an advisory |
| **Info** | looked at and deliberately kept | core-framework weight (`next`, `react`, `typescript`), documented gotchas, verified false positives — each with a one-clause reason |

Every tier appears; write `none` under an empty one. Every finding names **a
specific package and the file or manifest it lives in** (`server/package.json`,
`moment`) — "consider optimising dependencies" is not a finding.

### What to look for

| Look for | Evidence | Default tier |
|---|---|---|
| **Boundary bypass** — a relative import (`../reviewer-core/src/pipeline.js`) that leaves its package instead of using the tsconfig path alias or the package's public entry point | grep the imports | P0 from runtime source, P1 from tests |
| **Phantom** — imported but not in that module's `package.json` | import vs manifest | P0 from runtime source, P1 from tests |
| **Placement** — a devDependency imported from `src/`; or a `dependencies` entry only tests/tooling use (`@types/*`, test runners) | import vs manifest | P0 / P2 |
| **Version drift** — one package at different versions in different modules (state each module's version) | manifests | P1 if the major differs, else P2 |
| **Unused** — declared, never imported, never referenced by a script or config (check before you claim it) | grep | P1 if large, else P2 |
| **Duplicates** — one package installed at several versions inside a module | lockfile | P1 on the runtime path, else P2 |
| **Dual instance** — a module compiles a sibling's source that imports a package both install → two copies at runtime | alias + both manifests | P0 if versions differ, P1 for `zod`/`react`, else P2 |
| **Heavy** — a dependency whose removal would free a lot | sizes | Info for a core framework, else P1/P2 after asking "is there a lighter option or lazy loading?" |

### Internal versus external — never blur them

This repo is **not** a monorepo and not a pnpm/npm workspace: there is no
`workspace:*`, no root `package.json`, and each module has its own lockfile
(`pnpm` in `server/` and `client/`, `npm` in `reviewer-core/`, `e2e/`, `mcp/`,
`evals/`). Modules are linked **only** through tsconfig `paths` aliases that point
at a sibling's *source* (`@devdigest/shared`, `@devdigest/reviewer-core`), and
`src/vendor/shared` exists as two physical copies. So:

- an **internal** dependency is an alias link, a vendored copy, or a relative
  import across a module boundary — draw them as module→module edges, and say
  which kind each is;
- an **external** dependency is an npm package in a manifest — draw the shared ones
  as package nodes with each module's version on the edge;
- never describe the link between modules as a workspace or published package.

### Wording of every recommendation

You recommend; the user decides. Write "remove `moment` from `server/package.json`
— confirm before applying", give the command the user can run (`pnpm --dir server
remove moment`; `npm --prefix reviewer-core uninstall tsx`), and never say or imply
you ran it. An unverified claim is labelled "not verified".

## Mode A — scripted (Steps 1–5)

### Step 1 — scope (before running anything)

Modules: all, or the ones the user named → `--module server,client`.
**Offline is the default.** `--online` additionally runs each module's own
`pnpm|npm audit` and `outdated`, which **sends package names and versions to the
registry**; add it only when the user asked for vulnerabilities, outdated or
deprecated packages, and otherwise say in the reply that those were not checked.
A module without `node_modules` has no sizes: report it, do not install anything.

### Step 2 — collect

```sh
node .claude/skills/dependency-checker/scripts/collect.mjs [--module a,b] [--online] [--top N]
```

Prints the output directory `.claude/dependency-checker/<YYYY-MM-DD>/` (git-ignored)
with `report.md` (sections generated, three judgement blocks to fill) and
`metrics.json` (every number behind it). Read `report.md` whole; open
`metrics.json` only for a detail the report omits. A report whose blocks are
already filled is never overwritten silently — re-run with `--force` to replace it
or `--out <dir>` to write elsewhere.

Reading the numbers: **size** is installed bytes on this machine — not download
and not bundle size; **exclusive** is what `remove <pkg>` would really free (a
declared package is a boundary, so a peer such as `next` under `next-intl` counts
for itself); **runtime path** is everything reachable from `dependencies`;
**Used in** is a text scan, so `none` means "nothing found", not "provably dead".

### Step 3 — judge

First **verify each `verify`-confidence finding you intend to schedule** — open
the file, `grep` the repo, run `pnpm --dir <m> why <pkg>` / `npm --prefix <m>
explain <pkg>` — and state the result in the item ("confirmed: only mentioned in a
comment"). Then replace the placeholder inside each marker pair in `report.md`,
touching nothing else:

- `judgement:priorities` → the four tiers `#### P0` / `#### P1` / `#### P2` /
  `#### Info`; a table per tier (columns and wording in
  `references/prioritization.md`); every **high** finding scheduled or under Info
  with a reason;
- `judgement:advice` → 3–6 bullets of standing practice, each tied to a finding;
- `judgement:summary` → verdict line + 3–5 numbered takeaways ordered by priority.

Figures are **copied** from the report, never computed.

### Step 4 — check

```sh
node .claude/skills/dependency-checker/scripts/check-report.mjs .claude/dependency-checker/<date>
```

Fails (exit 1) on: a missing/out-of-order section, Summary not last, an empty block,
an unknown `F-nn`, a **high** finding not addressed, a missing tier heading, a
summary without 3–5 numbered takeaways, or a size figure that appears nowhere in
the generated sections. Fix until `check-report: ok`. It proves form, not truth.

### Step 5 — reply

Short, in the user's language: the report path; five lines (modules and total
size, runtime-path share, findings by severity, the biggest problem, the top
action); what was **not** checked; one question — which P0/P1 items to apply.

## Mode B — manual (data supplied, no tools)

Build the same five sections from **only** the data in the prompt. The
`<!-- judgement:… -->` marker comments belong to Mode A files — do not emit them,
and do not mention scripts you could not run:

1. **Scope** — list every module you were given data for; say it was analysed from
   supplied data, not measured; name what the data could not tell you.
2. **Dependency graph** — a `flowchart LR`: module nodes, internal edges (solid for
   an alias, dashed with `⚠` for a relative import that bypasses the entry point),
   and external packages shared by several modules as nodes whose edges carry each
   module's version. Minimal shape:

   ````
   ```mermaid
   flowchart LR
     server["server/"] -->|"alias @shared (source)"| reviewer["reviewer-core/"]
     server -.->|"⚠ relative import, bypass"| reviewer
     zod(["zod"]) -->|"3.23.8"| server
     zod -->|"3.22.4"| client["client/"]
   ```
   ````
3. **Size breakdown** — a table `Package | Module | Kind | Version | Installed size`
   from the figures given; sizes you were not given are `n/a`, never estimated.
4. **Findings & Priorities** — walk the "What to look for" table against the data,
   one finding per fact, each tiered, each naming package + file, each worded as a
   recommendation to confirm. Cross-check **drift** across all manifests and look for
   dependencies declared but never imported in the grep results.
5. **Summary** — verdict, then 3–5 numbered takeaways ordered by priority.

## Do not

- Install, update, remove, `dedupe` or otherwise change anything, or run a
  package-manager command that writes. Commands go in the report for the user.
- Hand-edit a lockfile or create a root `package.json`.
- Pass `--online` on your own initiative.
- State a size or count that the script or the supplied data did not give you;
  never compute a sum yourself in the judgement blocks.
- Present weight as a defect for a core framework — it is a fact, usually **Info**.
- Call the `vendor/shared` copy drift a bug; `CLAUDE.md` says the copies have
  already drifted and some differences are deliberate.
- Recommend editing `*/src/vendor/**` without saying it needs an explicit request.

## Read the reference you need

| Task | Read |
|---|---|
| What each finding rule means, its threshold and its known false positives | `references/rules.md` |
| Score formula, bucket criteria, how to verify, how to word an item, what advice is | `references/prioritization.md` |
| The exact report skeleton and the format of the three blocks | `references/report-template.md` |
| A good and a bad Priorities block, on real data | `examples.md` |

## Tests

```sh
node --test .claude/skills/dependency-checker/scripts/collect.test.mjs   # pass the FILE, not the directory
```

Unit tests use inline fixtures — no `node_modules`, no network. The live
`--online` path is verified against a real registry only when the user asks.
