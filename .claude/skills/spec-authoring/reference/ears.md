# EARS — phrasing a testable requirement

EARS (Easy Approach to Requirements Syntax), Mavin, Wilkinson, Harwood and
Novak, Rolls-Royce, IEEE RE'09. It separates the **condition** from the
**system response**, so each requirement is one checkable claim.

Course convention (not part of EARS itself): triggers in Ukrainian —
КОЛИ, ПОКИ, ЯКЩО … ТОДІ, ДЕ — and `(shall)` in parentheses as the marker of a
mandatory requirement. The rest of the sentence is English.

## The five patterns

| Pattern | Form | DevDigest example |
|---|---|---|
| Ubiquitous | The system (shall) … | The system (shall) scope every run query to the caller's `workspace_id`. |
| Event-driven | КОЛИ <event>, the system (shall) … | КОЛИ the user clicks **Re-run**, the system (shall) enqueue a new run and return `202` with its `run_id`. |
| State-driven | ПОКИ <state>, the system (shall) … | ПОКИ a run has `status='running'`, the system (shall) show a spinner in place of its cost. |
| Unwanted behaviour | ЯКЩО <condition>, ТОДІ the system (shall) … | ЯКЩО the provider returns no usage, ТОДІ the system (shall) store `cost_usd` as `NULL`. |
| Optional feature | ДЕ <option enabled>, the system (shall) … | ДЕ the agent has `ciFailOn` set, the system (shall) fail the check on any finding at or above that severity. |

Combine triggers only when both are genuinely required:
`ПОКИ a resync is running, КОЛИ the user clicks Resync again, the system (shall) ignore the click.`

## Good vs bad

| Bad | Why | Good |
|---|---|---|
| The page should load fast. | "should", "fast" — no marker, no number | The system (shall) render the PR list within 1 s for 200 PRs on the seeded DB. |
| КОЛИ the review fails, show an error and log it and retry. | three responses in one item | Split: AC show error · NFR log · EC retry policy. |
| The system (shall) handle errors properly. | "properly" — untestable | ЯКЩО `GET /pulls/:id/blast` returns 5xx, ТОДІ the system (shall) show `blast.error` with a Retry button. |
| The system (shall) use a React Query mutation for re-run. | implementation, not behaviour | КОЛИ Re-run succeeds, the system (shall) show the new run at the top of the timeline without a page reload. |
| The system (shall) support long titles. | "support" — what is observable? | The system (shall) truncate a PR title longer than one line with an ellipsis and show the full title on hover and to screen readers. |

## Vague words — never in AC/EC/NFR/UI (lint)

`fast`, `quick`, `quickly`, `slow`, `easy`, `easily`, `simple`, `intuitive`,
`user-friendly`, `seamless`, `seamlessly`, `robust`, `efficient`,
`efficiently`, `properly`, `appropriate`, `appropriately`, `adequate`,
`reasonable`, `as needed`, `as appropriate`, `if possible`, `etc.`,
`and/or`, `should`, `may`, `might`, `some`, `several`, `various`.

Replace with a number, a named state, a visible element, or a stored value.
If you cannot, the item becomes an open question.

## Self-check before writing an item

1. Can a test or a person with the running app decide pass/fail from the
   sentence alone?
2. Is there exactly one response?
3. Is the trigger an observable event or state, not an intention?
4. Does it describe behaviour, not code structure?
