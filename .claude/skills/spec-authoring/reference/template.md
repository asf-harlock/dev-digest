# Spec template and item formats

The lint (`scripts/lint-spec.mjs`) enforces everything marked **(lint)**.

## Skeleton

```markdown
# Spec: <feature name>
Spec ID: SPEC-NN
Status: draft
Supersedes: <relative link to the spec this replaces, or —>

## Проблема й користувач
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
## Edge cases
## Non-functional requirements
## Inputs and provenance
## Untrusted inputs
## Open questions
```

- Line 1 is `# Spec: …` **(lint)**.
- The three header lines follow, each once: `Spec ID: SPEC-NN` matching the
  filename prefix, `Status:` one of `draft | approved | implemented`,
  `Supersedes:` **(lint)**.
- The nine `##` headings appear verbatim, in this order, and no other `##`
  heading exists **(lint)**. `###` sub-headings inside a section are fine.
- No section is empty **(lint)**. When a section genuinely has nothing, write
  `None — <why>` (e.g. `None — the feature reads no external input.`).
- Body in English; the Ukrainian section heading and the EARS triggers are
  the course's convention. Identifiers in `backticks`, exactly as in the repo.

## Item formats

Each item is one list line starting with its bold ID. Continuation lines are
indented and belong to the item.

| Section | Format |
|---|---|
| User stories | `- **US-1** As a <role>, I want <capability>, so that <outcome>.` |
| Acceptance criteria | `- **AC-1** (US-1) КОЛИ <trigger>, the system (shall) <response>.` |
| Edge cases | `- **EC-1** ЯКЩО <unwanted condition>, ТОДІ the system (shall) <response>.` |
| Non-functional | `- **NFR-1** The system (shall) <measurable property>.` |
| Untrusted inputs | `- **UI-1** <source> → <sink>: the system (shall) <neutralisation>.` |
| Open questions | `- **Q-1** <question> — default: <recommended answer> — owner: <who decides>.` |

Rules **(lint)**:
- An ID prefix appears only in its own section (`AC-` only under Acceptance
  criteria, etc.) and each ID is unique.
- Each AC carries `(US-n)` or `(US-n, US-m)`, and every referenced US exists.
- Every US is referenced by at least one AC.
- Each AC, EC, NFR and UI item has exactly one `(shall)`.
- AC items start with a trigger (`КОЛИ`, `ПОКИ`, `ЯКЩО … ТОДІ`, `ДЕ`) or with
  `The system` (ubiquitous). EC items contain both `ЯКЩО` and `ТОДІ`.
- Q items carry `default:`.
- No vague words in AC/EC/NFR/UI (list in `ears.md`).

A dropped item keeps its ID, struck through, with the reason:
`- ~~**AC-4**~~ Dropped 2026-10-02 — merged into AC-2.` Struck items are
exempt from the content rules but still reserve their ID.

## What goes in each section

- **Проблема й користувач** — who hits the problem, in which situation, and
  what it costs them today. Evidence where it exists (a code path, an issue).
- **Goals / Non-goals** — two sub-lists. Non-goals name what a reader would
  wrongly assume is included, and every approach considered and rejected:
  `Not doing X — considered and rejected because …`.
- **User stories** — one per distinct user outcome; not one per screen.
- **Acceptance criteria (EARS)** — the happy paths and required behaviours,
  observable from outside: a response shape, a visible state, a stored value.
- **Edge cases** — every kept missing-state and corner-case finding from the
  design analysis, as `ЯКЩО … ТОДІ …`.
- **Non-functional requirements** — only those that apply, each with a
  number or a checkable standard: latency/timeouts, LLM calls and cost per
  run, WCAG 2.1 AA, i18n namespace (`client/messages/<locale>/<ns>.json`),
  what is logged, workspace scoping through `getContext()`, retention.
- **Inputs and provenance** — a table: value · source (table.column, GitHub
  API field, LLM output, user input, config, secrets file) · trusted? ·
  design source it came from (Figma frame, screenshot, text, code path).
- **Untrusted inputs** — every attacker-controllable value → every sink it
  reaches (LLM prompt, rendered HTML/Markdown, shell/git argument, SQL, URL,
  log) → the required neutralisation, one `UI-n` per pair. `None — <why>` is
  allowed only when the feature reads no author- or model-controlled text.
- **Open questions** — what is still undecided, each with a default and an
  owner, so planning can proceed on the default if nobody answers.
