# Rubric and report template

## Per-agent questions

| Lens | Ask | Typical evidence |
|---|---|---|
| **Fit** | Was this the right agent and model for the task? Would a cheaper model or no agent at all have done? | `flags`, `models`, `requestedModel`, `freshShare`, `readShare` — confirm or reject every flag, with the reason |
| **Hard** | Where did it struggle? | `errors` (wrong path, denied tool), many tool calls for a small result, "could not find", "unverified", `pending R<n>`, a question whose answer was already in its prompt |
| **Easy** | What went through with no friction? | few tools, 0 errors, report used unchanged, no correction in the timeline after it |
| **Duplicated** | What did it re-do that someone already had? | `sharedReads` (a file the orchestrator or another agent already read and cited), `rereads`, the same fact in two reports, prompt pasting text the agent then re-read from disk |
| **Missed** | What did it not deliver that was needed later? | a user correction after its hand-back, a follow-up researcher or resume, `quality.gates` with `firstTryPass: false` on its output, `sdd` verify Fail/Unverified rows, something the orchestrator added when relaying |
| **Hand-off** | Was the report the right size and shape for the next step? | `reportChars` vs what was relayed; a report the orchestrator had to reshape; a question the orchestrator could not relay as written |
| **Prompt** | Was its input enough and not too much? | `promptChars`; facts it had to rediscover; instructions it ignored; resumes (`resumes`) that only restated what the first prompt lacked |

Orchestrator (this session) — same lenses, plus:
- **Order.** Were independent agents launched in one message (`maxParallel`)?
  Was anything run serially that did not depend on the previous result?
- **Relays.** Did it forward reports verbatim where the next agent needed
  detail, and compress where only a verdict was needed?
- **Own work.** Did it read or search what an agent had already delivered
  (`sharedReads` with `orchestrator`)? That is duplication by the orchestrator,
  not by the agent.
- **User time.** Idle gaps waiting for the user (`spanMin − activeMin`) caused
  by a question that had a safe default.

Verdict per lens: **ok**, **issue** (with evidence) or **n/a**. No numeric
scores — they suggest a precision the evidence does not have.

## `report.md` template

```markdown
# Workflow retro — <run name> (<YYYY-MM-DD>)

Session `<id>` · span <spanMin> min · active <activeMin> min · <N> agents · max parallel <maxParallel>
Numbers include this retro's first call.

## Numbers
| Actor | Model | Active min | Fresh tokens | Output | Cache read | Tools | Errors | Resumes |
|---|---|---|---|---|---|---|---|---|
| orchestrator | … | … | … | … | … | … | … | — |
| 1. <type> — <description> | … | … | … | … | … | … | … | … |
| **Total** | | | … | … | … | | … | |

Orchestrator share of fresh tokens: <orchestratorShareFresh>.

## Outcome
| Gate | Runs | Fails | First try | Final |
|---|---|---|---|---|
<one row per quality.gates entry, or "No gate ran">

<`/implement` only: verify rounds (Pass/Fail/Blocked/Unverified per round) and review rounds (findings by severity)>
Resumes: <quality.resumes> · errors: <errorsByKind>

## Trend
<vs the last comparable run(s) in history.previous: fresh tokens, active min,
resumes, gates first-try, orchestrator share — one line each with Δ; or
"No comparable run yet">

## Order
<numbered launch order with timestamps; mark what ran in parallel and what waited on the user>

## Per agent
### <n>. <type> — <description>
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok / issue | … |
| Hard | … | … |
| Easy | … | … |
| Duplicated | … | … |
| Missed | … | … |
| Hand-off | … | … |
| Prompt | … | … |

### Orchestrator
<same table + Order / Relays / Own work / User time>

## Duplication
<sharedReads, rereads, facts found twice — one line each, with who>

## Proposals
| # | File | Change | Evidence | Expected effect |
|---|---|---|---|---|
| 1 | `.claude/agents/<name>.md` | … | … | … |

## For engineering-insights (not recorded here)
<codebase learnings this run surfaced, one line each, or "None">
```
