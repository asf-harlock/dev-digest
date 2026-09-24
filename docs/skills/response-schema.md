# Response schema changes

Apply this skill to any diff that changes a response contract even when the
route itself is untouched. This is narrower than `breaking-change`: it is
specifically about the SHAPE of what comes back, independent of whether the
route path/method changed.

For every changed response field, classify the change:
- **Field removed** — always breaking for any caller reading it.
- **Field added, required (non-nullable, no default)** — breaking for a caller
  that validates the response against a strict/exact schema, even though it
  looks additive.
- **Field added, optional or defaulted** — safe.
- **Type changed** (`string` → `string | null`, `number` → `string`, scalar →
  array/object) — breaking regardless of direction, including "widening" a
  type, because a caller's own type narrowing (`typeof x === 'number'`) now
  fails.
- **Nullability changed** — `nullable()` → required, or the reverse: a caller
  with `if (x)` guards can start silently skipping data, or one without a null
  check can throw.
- **Wrapper/envelope changed** — e.g. a bare array becomes
  `{ items: [...], total: n }`. Always breaking; every caller iterating the old
  shape breaks.

## Good example
```diff
 export const AgentRun = z.object({
   id: z.string(),
   status: z.enum(['queued', 'running', 'done', 'failed']),
+  cost_usd: z.number().nullable().default(null),
 });
```
A nullable, defaulted addition — an old caller ignoring the new key is
unaffected, and a new caller can rely on the key always being present (never
`undefined`).

## Bad example
```diff
 export const AgentRun = z.object({
   id: z.string(),
-  score: z.number(),
+  score: z.number().nullable(),
-  findings: z.array(Finding),
+  findings: { items: z.array(Finding), total: z.number() },
 });
```
Two breaks in one diff: `score` went from always-present to nullable (a caller
doing `run.score.toFixed(1)` now throws on `null`), and `findings` changed from
a bare array to a wrapped object (`run.findings.map(...)` throws — `.map`
doesn't exist on the wrapper). Report each separately, quoting the field and
the exact type change.

Report CRITICAL for a removed field, a retyped field, or a changed envelope on
a response reachable outside this service; WARNING for a nullability loosening
on a field most callers already null-check, or for an internal-only response.
