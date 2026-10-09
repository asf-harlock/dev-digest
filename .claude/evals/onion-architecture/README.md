# onion-architecture evals — harness

The test cases and fixtures ship **inside the skill**:

```
.claude/skills/onion-architecture/evals/
├── evals.json      prompts + assertions (3 cases, 4 assertions each)
└── fixtures/       digest/ · triage/ · run-export/   (module snapshots laid out as server/src/modules/<name>)
```

Everything needed to *run* them lives here, so the skill folder stays deliverable on its own.

| File | Purpose |
|---|---|
| `verify-fixtures.sh` | Deterministic, hermetic. Overlays the fixtures on a copy of `server/src`, runs `depcruise` with the real config and requires exactly the violations in `arch-expected.json`. Run it after changing a fixture or `server/.dependency-cruiser.cjs`. |
| `arch-expected.json` | The `(rule, file)` pairs `pnpm arch` must report, plus the four findings it cannot see. |
| `workspace/` | Output of LLM runs (gitignored). |

## Fixture rules

- No comment, name or docblock may hint at a defect — the findings are what the skill is being tested on.
- Each case plants three findings and includes clean code that looks suspicious (a service building its own repository from `container.db`, a correctly scoped join) to catch false positives.
- Changing a fixture means updating `evals.json` and `arch-expected.json` in the same commit.

## LLM comparison (with skill vs. without) — manual, costs tokens

1. Copy each `evals/fixtures/<case>` to a neutral temp directory outside `.claude/`. The baseline run must not see the skill folder, and the assertions in `evals.json` are the answer key — agents get the copy only.
2. Substitute that path for `{fixture_dir}` in the prompt.
3. Run every case twice with the `anthropic-skills:skill-creator` workflow: *with_skill* (told to read `.claude/skills/onion-architecture/SKILL.md`) and *without_skill* (no Skill tool, no reads under `.claude/skills/`).
4. Save to `workspace/iteration-N/eval-<name>/{with_skill,without_skill}/run-1/` — the aggregator expects the `run-1` level — then grade, aggregate and open the viewer as skill-creator describes.

First run (2026-10-08): both configurations found 9/9 planted findings. The repo's own `CLAUDE.md`, `.dependency-cruiser.cjs` and lint config already encode these rules, so review-only cases do not separate the skill from the baseline. The next iteration should add *code-writing* cases (shrinking the `ORM_DEBT` allowlist, wiring a new port end to end).

## CI

`verify-fixtures.sh` is the part worth gating on: run it when `.claude/skills/onion-architecture/**` or `server/.dependency-cruiser.cjs` change. The LLM comparison is non-deterministic, so run it on `workflow_dispatch` or a schedule, not per PR.

## Results log

| Date | Cases | Runs / config | With skill | Without skill | Reading |
|---|---|---|---|---|---|
| 2026-10-08 | 1-3 (review, small fixtures) | 1 | 100% | 100% | ceiling: repo docs + lint config already encode the rules |
| 2026-10-08 | 4-6 (code writing, worktrees) | 3 | 99% ± 3% | 92% ± 10% | gap is almost entirely case 6: `MockXxx` in `adapters/mocks.ts` (3/3 vs 0/3) and port placement (2/3 vs 0/3) |
| 2026-10-08 | 7 (review, 16-file fixture, 12 planted findings + 3 decoys) | 5 | 12/12 found in 5/5 runs | 12/12 found in 5/5 runs | ceiling again; no recall difference measurable |

Model/effort for the three rows above: executor = session default (Sonnet 5.5), effort not set explicitly; graders = same default.

Case 7 detail: 10 blind-graded reviews, 60/60 planted findings found per configuration (95% upper bound on the miss rate ≈ 5% per finding). One baseline review made a questionable claim against the clean control module; 3 vs 2 doubtful claims overall. With the skill: ~4% more tokens, ~11% more time.

Takeaway: review-style cases on explicit rule violations do not separate the skill from a baseline that can read `CLAUDE.md`, `.dependency-cruiser.cjs` and the lint config. What does separate them is knowledge that lives only in the skill (mock/port wiring conventions). New cases should target that, or hide the repo's own rule files from the baseline.

### Haiku, effort low (2026-10-08)

Executor `model: haiku`, `effort: low`; graders unchanged (session default). Same design as above (cases 1-3 x1, 4-6 x3, 7 x5; webhook without-skill has 4 samples — see note), blind-graded, code cases also checked by `check_run.py`.

| Cases | With skill | Without skill | Notes |
|---|---|---|---|
| 1-3 small reviews | 4/4 each | 4/4 each | ceiling (n=1) |
| 4 polling-cooldown | 4/8 x3 | 4/8 x3 | **no Haiku run in either arm** created repository/service or removed the debt line (Sonnet: 6/6 did). Skill-arm agents read "known debt" as permission to leave it |
| 5 stale-pulls | 7/8, 8/8, 7/8 | 5/8 x3 | with skill: query in `PullsRepository` (3/3); without: inline in `routes.ts` (3/3) |
| 6 webhook | 9/10 x3 | 5/10, 8/10 x3 | `MockXxx` in `adapters/mocks.ts` 3/3 vs 0/4 (same as Sonnet). Port in `vendor/shared/adapters.ts`: 0/7 |
| 7 large review (12 findings + 3 decoys) | 11.4/12, decoys 3.0/3 | 10.6/12, decoys 2.4/3 | pg-code-in-service found 5/5 vs 2/5; clean control wrongly attacked 0/5 vs 3/5; unmapped rows found 2/5 vs 1/5 |
| **Overall** | **86.8%** | **75.6%** | +11 pts; Sonnet on the same code cases: 99% vs 92% |

Caveats: n is small; `effort: low` may or may not have been applied by the harness; a checker bug (`routes_add_no_orm` over-matching `new XRepository(container.db)`) was found and corrected after the fact; two slots were launched twice by mistake and the duplicates were re-assigned (`_REASSIGNED.md` in the run workspace).

Skill follow-up this suggests: the "Known debt" paragraph should say plainly that a task which touches a listed file must pay that debt down; a weaker model took the allowlist as permission.

## What a ready-made tool covers, and what our course still lacks

Written 2026-10-08 after three evaluation rounds on this skill.

**Covered out of the box (Skill Creator + the harness in this folder)**

| Question | Answered by |
|---|---|
| Does the skill change the outcome (with vs. without), and by how much? | parallel with/without runs, `grading.json`, `aggregate_benchmark` (mean ± σ, time, tokens) |
| Which assertions discriminate and which are always green? | analyst pass; here: review cases ceiling out, `MockXxx` in `adapters/mocks.ts` and the repository-first rule discriminate |
| Do the fixtures still violate what they should, as the repo's rules evolve? | `verify-fixtures.sh` — hermetic, exact set of `pnpm arch` violations |
| Did generated code keep the repo's gates green? | `check_run.py` — patch applied to a clean export, `arch`, `tsc`, new hermetic tests, allowlist did not grow |
| Human review of outputs | `generate_review.py` viewer, `feedback.json` |
| A different model / effort | one `model` / `effort` parameter per run (we ran Sonnet and Haiku-low) |
| Will the skill trigger from its description? | Skill Creator's description loop (`run_loop.py`) — **not run yet** |

**Not covered — what our course (the starter template, lessons L01–L08) still needs**

1. **A rubric standard.** Every assertion here was written by hand and half of them are judged by an LLM. The course has no shared format for "an acceptance check", no distinction between machine-checkable and judgement checks, and no guidance on keeping graders independent from the author of the fixtures.
2. **Ground truth outside the repo's own docs.** `CLAUDE.md`, `.dependency-cruiser.cjs` and the lint config already encode most rules, so a baseline that can read them scores near the ceiling. The course needs cases about knowledge that exists *only* in the skill, or a way to hide the repo's rule files from the baseline.
3. **A skill-vs-project conflict check.** The skill says the port goes in `vendor/shared/adapters.ts`; `CLAUDE.md` says never touch `vendor/**` without an explicit request. Agents split on it (Sonnet 2 of 3, Haiku 0 of 7). Nothing in the course detects contradictions between a skill and the project's own instructions.
4. **A cost/variance policy.** One run is noise: Sonnet's 100% vs 92% and Haiku's 87% vs 76% have σ of 10–18 points at n = 3–5. The course has no rule for how many runs justify a claim, nor for pinning model, effort and grader model in the report (we only found out afterwards that none had been recorded).
5. **Isolation and bookkeeping for code-writing evals.** Worktrees, symlinked `node_modules`, a 20-agent concurrency cap, duplicated slots, subagents that may not write report files — all handled ad hoc here. A reusable runner (queue, slot ledger, patch capture, cleanup) does not exist.
6. **Trigger and negative testing.** Whether the skill fires on realistic prompts, and stays quiet on near-misses, is untested for every skill in the repo.
7. **CI wiring.** Only `verify-fixtures.sh` is deterministic enough to gate a PR; LLM runs are non-deterministic and cost ~75–110k tokens each. The course needs an explicit split (cheap deterministic gate per PR, expensive comparison on schedule or by hand).
8. **A place for eval artefacts.** Skills are delivered as a folder; vendored skills have lock-file hashes. We settled on `evals/` inside local skills and `.claude/evals/<skill>/` for the harness, but the course has no convention yet.
