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
- **Topology.** Was this the right *set* of agents? Take every entry in
  `metrics.topology` and accept or reject it in the Topology section, with a
  reason. Reject a candidate whose two agents must stay independent (a reviewer
  and the verifier that checks the same diff, two parallel reviewers), or whose
  "fold" would move a model call into an Opus orchestrator. Add a structural
  change the script cannot see when evidence supports it (e.g. two agents
  whose reports the orchestrator always relayed together).

## Proposal actions

Every proposal starts with exactly one of these verbs, naming the agents:

| Action | Shape | Typical source |
|---|---|---|
| **Merge** | "merge `<X>` into `<Y>`" / "resume `<X>` instead of launching `<Y>`" | `topology` `merge`, a fact found twice |
| **Fold** | "fold `<X>` into the orchestrator / into `<Y>`" | `topology` `fold` |
| **Split** | "split `<X>` into `<X1>` (…) and `<X2>` (…)" | `topology` `split`, a resume chain |
| **Drop** | "drop `<X>` — `<Y>` already covers it" | a report nobody relayed |
| **Concurrency** | "concurrency `<N>` → `<M>` for `<phase>`" | `topology` `concurrency`, Order lens |
| **Model** | "`<X>`: `<model>` → `<model>`" | `topology` `model`, `flags` |
| **Reorder** | "launch `<X>` before / together with `<Y>`" | Order lens |
| **Edit** | "`<file>`: add / remove / change `<rule>`" | any lens; a prompt or definition gap |

A proposal written as advice without one of these verbs ("be more careful",
"consider") is dropped. At least one accepted topology candidate becomes a
proposal unless all were rejected; say so in that case.

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

<`/run-plan` only: verify rounds (Pass/Fail/Blocked/Unverified per round) and review rounds (findings by severity)>
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

## Topology
| Candidate | Verdict | Reason |
|---|---|---|
| <topology[].suggestion, verbatim> | accept / reject | <evidence or the independence it would break> |
<or "No candidates"; add rows for structural changes the script missed, marked "(manual)">

## Proposals
| # | Action | File | Change | Evidence | Expected effect |
|---|---|---|---|---|---|
| 1 | Merge | `.claude/skills/<name>/SKILL.md` | merge `<X>` into `<Y>`: … | … | … |

## For engineering-insights (not recorded here)
<codebase learnings this run surfaced, one line each, or "None">
```
