# Workflow retro — `/pr-self-review` fan-out for PR #21 (2026-10-06)

Session `0f45694e-708d-428d-9813-a103610ed921` · window 18:36:30–18:41:10 UTC ("push and do pr" → `gh pr create` returned PR #21) · span 4.6 min · active 5.5 min (orchestrator) · 3 agents · max parallel 3
The window ends before this retro started, so its own first call is **not** in the numbers. The rest of the session (the L05 fixes, the SPEC-07 retro) is outside the window.

## Numbers
| Actor | Model | Active min | Fresh tokens | Output | Cache read | Tools | Errors | Resumes |
|---|---|---|---|---|---|---|---|---|
| orchestrator | opus-5-5 (18 calls) | 5.5 | 46 573 | 14 346 | 3 624 002 | 16 | 1 | — |
| 1. general-purpose — PSR backend reviewer | sonnet-5-5 | 0.5 | 111 997 | 68 | 456 564 | 13 | 0 | 0 |
| 2. general-purpose — PSR database reviewer | sonnet-5-5 | 0.3 | 82 108 | 58 | 268 784 | 8 | 0 | 0 |
| 3. general-purpose — PSR workflow-docs reviewer | sonnet-5-5 | 2.2 | 106 790 | 88 | 1 016 501 | 19 | 0 | 0 |
| **Total** | | | **347 468** | **14 560** | 5 365 851 | | 1 | 0 |

Orchestrator share of fresh tokens: 0.13. Cache read (5.4 M) is shown separately, not added into tokens spent.

## Outcome
| Gate | Runs | Fails | First try | Final |
|---|---|---|---|---|
| pr-self-review/scripts/collect-diff.sh | 1 | 0 | ✓ | ✓ |
| pr-self-review/scripts/hard-rules.sh | 1 | 1 | ✗ | ✗ (heuristic — see orchestrator Hard: the exit 1 came from a zsh error in the chained `echo =====`; the script itself printed "3 findings (0 critical)") |
| pr-self-review/scripts/run-gates.sh | 1 | 0 | ✓ | ✓ |
| pr-self-review/scripts/pr-body.sh | 1 | 0 | ✓ | ✓ |

`build-report.sh` was run in a heredoc command whose first segment was `cat`, so it is not counted as a gate. Its verdict line was "verdict: pass — 0 critical · 4 warning · 4 suggestion".
Resumes: 0 · errors: exit 1.

## Trend
No comparable run: the earlier retros in `history.previous` are spec/`/run-plan` runs, not a 3× `general-purpose` review fan-out.

## Order
1. 18:36:35 user: "push and do pr" → 18:36:39 `Skill pr-self-review` loads the **user-level PrestaShop** skill → the orchestrator reads the project skill instead.
2. 18:36–18:37 collect → hard rules + gates (serial, as the skill requires) → stale `agents/*.json` from 2026-10-03 moved aside → slices written to files.
3. 18:37:29 / 18:37:40 / 18:37:55 backend ∥ database ∥ workflow-docs. The three Agent calls are in one turn, 26 s apart.
4. Hand-backs → each reply re-typed into `agents/<agent>.json` → `build-report.sh` → push → `pr-body.sh` → `gh pr create`. No wait on the user inside the window.

## Per agent

### 1. general-purpose — PSR backend reviewer
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue | `Skill` ×6 for a 94-line slice of 3 files. 111 997 fresh (32% of the run), almost all of it `cache_write` (111 917) from loading the six routed skills. Result: one SUGGESTION at confidence 0.6. |
| Hard | ok | 0 errors. |
| Easy | ok | 0.5 active min. |
| Duplicated | ok | `severity-rubric.md` is read by all three reviewers, and each needs it. |
| Missed | ok | The test gap it raised is real ("Nothing asserts … stored as SQL NULL"). |
| Hand-off | ok | Valid JSON with no prose around it, as the prompt asks. |
| Prompt | ok | It got context lines on what changed, so it did not re-derive intent. |

### 2. general-purpose — PSR database reviewer
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue | 82 108 fresh and 0 findings for 11 hand-written lines. The other 3 988 diff lines are the generated `0019_snapshot.json` (`git diff --stat`). The skills it loads (`drizzle-orm-patterns`, `onion-architecture`) overlap the backend reviewer's set, and both read `server/INSIGHTS.md` (`sharedReads`). |
| Hard | ok | 0 errors. |
| Easy | ok | 0.3 active min, 8 tool calls. |
| Missed | ok | No defect found later. |
| Hand-off | ok | 276-char JSON. |
| Prompt | ok | The prompt pointed it at the snapshot as generated ("only spot-check … `grep -n head_sha`"), and it read it that way. |

### 3. general-purpose — PSR workflow-docs reviewer
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | The only reviewer whose findings changed the PR body: 1 WARNING + 3 SUGGESTION, each with a file:line. 15 Bash calls, mostly greps over the 457 KB slice. |
| Hard | ok | 0 errors. 2.2 active min, the longest of the three, matching the largest slice. |
| Easy | ok | — |
| Duplicated | ok (minor) | Re-read `history.jsonl` and `agents/README.md` twice (`rereads`). |
| Missed | ok | It caught that the redaction misses the slugified project dir and the per-uid temp dir (both carry the OS username), a gap in this session's own work. |
| Hand-off | ok | 6 853 chars of JSON, used unchanged. |
| Prompt | ok | It was told not to read the generated `metrics.json` in full, and did not. |

### Orchestrator
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue | 14 346 output tokens on Opus in 4.6 min. Most of it is the three reviewer replies re-typed into heredocs to write `agents/<agent>.json`, as `subagent-prompt.md` requires ("Write each reply verbatim"). |
| Hard | issue | `Skill pr-self-review` resolved to the user-level PrestaShop skill (`~/.claude/skills/pr-self-review`), not the project one. That cost one detour turn. Separately, `echo =====` in zsh caused the only error ("(eval):1: ===== not found"). This is the zsh trap the root `CLAUDE.md` Gotcha added in this same session warns about. |
| Order | ok | Collect → hard rules → gates → fan-out, in the skill's order. All 3 reviewers launched in one turn. |
| Relays | ok | Slices went to files rather than inline: the 457 KB workflow-docs slice would not fit a prompt. Each reviewer got a one-paragraph change summary and the "already known" list. |
| Own work | **issue (caught)** | `build-report.sh` merges `agents/*.json` wholesale (`build-report.sh:40`). Stale `backend.json`, `frontend.json` and `workflow-docs.json` from 2026-10-03 were still there and would have merged findings from another PR. The orchestrator moved them aside by hand. `collect-diff.sh` does not clear that directory. |
| User time | ok | No question inside the window. |

## Duplication
- `.claude/skills/pr-self-review/reference/severity-rubric.md` — all 3 reviewers (expected).
- `server/INSIGHTS.md` — backend and database reviewers.
- `.claude/pr-self-review/pr-body.md` — orchestrator 3×.

## Topology
| Candidate | Verdict | Reason |
|---|---|---|
| split general-purpose:adc1bbf — a fresh agent per phase/layer, resume only for fixes (0 resumes, 32% of fresh tokens) | reject | One-phase reviewer with 0 resumes. 32% is a share of a 3-agent run, not a sign the agent is too big. The `split` rule fires on share alone in small runs (proposal 5). |
| split general-purpose:a0d43c7 — a fresh agent per phase/layer, resume only for fixes (0 resumes, 31% of fresh tokens) | reject | Same reason. |
| (manual) merge database reviewer into backend reviewer when the database slice is generated output plus a few lines | accept | 11 hand-written lines vs 3 988 generated. The skill sets overlap, both read the same INSIGHTS. 0 findings for 82 108 fresh. |

## Proposals
| # | Action | File | Change | Evidence | Expected effect |
|---|---|---|---|---|---|
| 1 | Edit | `.claude/skills/pr-self-review/scripts/collect-diff.sh` | Empty `.claude/pr-self-review/agents/` (move it to `agents.prev/`) at the start of every collect, so `build-report.sh` merges only this run's replies. | `build-report.sh:40` merges `agents/*.json`; three stale replies from 2026-10-03 were present and were moved aside by hand. | Closes a silent wrong-verdict path: old findings, or an old missing CRITICAL, can no longer leak into a new report. |
| 2 | Edit | `.claude/skills/pr-self-review/reference/subagent-prompt.md` | (a) `<PATCH>` becomes the path of a slice file written by `patch-slice.sh <agent> > slices/<agent>.patch`, not the inline diff. (b) The reviewer writes its own JSON to `.claude/pr-self-review/agents/<AGENT>.json` (its only allowed write) and returns just "written". | Orchestrator output 14 346 on Opus, mostly re-typed JSON. The workflow-docs slice was 457 KB, which cannot go inline. | Most of the orchestrator's 14 346 Opus output tokens go away; no transcription risk in "verbatim". |
| 3 | Merge | `.claude/skills/pr-self-review/scripts/collect-diff.sh` | Merge the `database` agent into `backend` when the database slice has ≤ 50 changed lines outside `migrations/meta/*.json`. Keep it separate when the schema change is real. | Database reviewer: 0 findings, 82 108 fresh, 11 hand-written lines vs 3 988 generated. | −1 agent; up to −82 108 fresh on a change like this one. |
| 4 | Edit | `~/.claude/skills/pr-self-review/SKILL.md` (user-level) | Rename the PrestaShop skill (e.g. `prestashop-pr-self-review`) so `/pr-self-review` in this repo resolves to the project skill that the `PreToolUse` hook checks. | 18:36:39 `Skill pr-self-review` loaded "multisites PrestaShop" instructions; the orchestrator had to read the project skill by hand. | −1 detour turn per run; no risk of following the wrong review process. |
| 5 | Edit | `.claude/skills/workflow-retro/scripts/collect.mjs` | Fire `split` on `freshShare ≥ 0.3` only when the run has ≥ 5 agents (resumes ≥ 3 stays unconditional). Also, per PR #21's review: exempt checkers from `fold` and redact the slugified project path and `$TMPDIR` prefix. | Both `split` candidates here were rejected as small-run noise. PR #21 workflow-docs findings on `fold` and redaction. | Fewer rejected candidates; committed `metrics.json` no longer shows the username. |

## For engineering-insights (not recorded here)
- None from this window. The `adapters → modules` dependency-cruiser gap from the SPEC-07 retro is still unrecorded.
