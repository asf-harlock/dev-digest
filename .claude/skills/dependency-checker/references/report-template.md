# Report skeleton

`scripts/collect.mjs` writes `report.md` with this skeleton, and Mode B (manual)
reproduces it by hand. Headings are fixed, in this order, none added or removed;
**Summary is last**. In Mode A the **generated** parts are never edited by hand and
the three **judgement** blocks are the only text you write.

| `##` section | Subsections | Source | Holds |
|---|---|---|---|
| *(title)* | — | generated | `# Dependency report — <date>` + one line: repo, short `HEAD`, module count, offline/online |
| **Scope** | — | generated | module table (package, manager, lockfile, installed?, direct prod/dev), mode, what was checked and not checked, how size is measured |
| **Dependency graph** | `### Internal links between modules` · `### External packages shared across modules` | generated | Mermaid component map (modules, alias links, relative-import bypasses `⚠`, vendored copies), tables of internal links, relative bypasses and vendor drift; Mermaid map + version table of packages declared in ≥ 2 modules |
| **Size breakdown** | `### At a glance` · one `### <module>/` per module | generated | totals, module table, size-by-module pie; per module a weight map (top 12 direct deps, coloured by size, the three heaviest expanded one level), top-N table, heaviest packages overall, duplicate versions |
| **Findings & Priorities** | `### Ranked findings` · `### Priorities` · `### Advice` | generated · **judgement** · **judgement** | every finding ranked with evidence and a fix · P0/P1/P2/Info · standing practice |
| **Summary** | — | generated line + **judgement** | counts by severity, then verdict and 3–5 numbered takeaways |

## The three blocks

They sit between markers. Replace **only** the placeholder line between them and
leave the marker comments exactly as they are — `check-report.mjs` finds the
blocks by them.

```
<!-- judgement:priorities -->
…your text…
<!-- /judgement:priorities -->
```

### `priorities`  (under `### Priorities`)

Exactly four tier headings, in this order, each with a table (format in
`prioritization.md`) or the word `none`:

```
#### P0 — fix before the next merge
#### P1 — plan it
#### P2 — housekeeping
#### Info — kept on purpose
```

The checker requires all four tiers, every `high` finding cited somewhere in the
block, and every `F-nn` you cite to exist. `Info` entries carry a one-clause reason.

### `advice`  (under `### Advice`)

3–6 bullets, each `**Guard|Measure|Align|Document|Cadence** — what — why (F-nn or a
metric) — how to start`. None repeats a priority item.

### `summary`  (under `## Summary`)

A one-line verdict (healthy / needs attention, with the one or two figures that
carry it — copied), then **3–5 numbered takeaways ordered by priority** — each
concrete (package, file, action), then one line on what was **not** checked:

```
Needs attention: 565 MB on the runtime path, one real boundary bypass.

1. Fix the relative imports from reviewer-core/test into server/src (F-09).
2. Remove unused `tsx` from reviewer-core/package.json (F-03).
3. Pin `zod` in server/ and mcp/ tsconfig paths (F-05, F-07).

Not checked: vulnerabilities and outdated versions (offline run).
```

## Language

Judgement blocks are written in the user's language. Package names, file paths,
`F-nn` ids, commands and every heading stay in English; the generated sections are
always English.

## What the checker enforces

`scripts/check-report.mjs <dir>` — exit 1 on any of: a missing or out-of-order
section, or a report that does not end with `## Summary`; a block missing or still
the placeholder; an `F-nn` that is not in `metrics.json`; a `high` finding not cited
in `priorities`; a missing `P0`/`P1`/`P2`/`Info` tier heading; a summary without 3–5
numbered takeaways; a `<n> KB|MB|GB` figure in your text that appears nowhere in the
generated sections.
