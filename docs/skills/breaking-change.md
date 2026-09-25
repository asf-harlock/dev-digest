# Breaking change detector

Apply this skill whenever the diff touches a route definition, a request/response
Zod contract, or a shared type consumed outside this service. A change is
BREAKING when a caller that worked against the contract before this diff would
fail against it after — not when the code merely looks different.

Check the diff against this list; report only the ones that are actually
reachable given what the diff touches:
- Route removed, renamed, or method changed (`GET /pulls/:id` → `GET /pull/:id`,
  or `PATCH` → `PUT`).
- A REQUEST field flipped optional → required, or a query/path param renamed.
- A RESPONSE field removed, renamed, or its type changed (string → number,
  single value → array, an object flattened or nested differently).
- A status code changed for a case a caller already branches on (e.g. a 404
  that becomes a 200 with `{ found: false }`).
- An enum value removed or renamed on either side.

For each finding, name the field/route, quote the before/after shape, and state
the caller-visible symptom (a validation 400, `undefined.property`, a switch
statement falling through).

## Good example
```diff
 export const PullSummary = z.object({
   id: z.string(),
   title: z.string(),
+  labels: z.array(z.string()).default([]),   // additive, defaulted — no caller breaks
 });
```
Adding an optional/defaulted field is not a breaking change — nothing here
should be flagged.

## Bad example
```diff
 export const PullSummary = z.object({
   id: z.string(),
-  status: z.enum(['open', 'closed']),
+  status: z.enum(['open', 'merged', 'closed']),   // fine — additive enum value
-  reviewer: z.string(),
+  reviewers: z.array(z.string()),                 // BREAKING: renamed AND retyped
 });
```
`reviewer` → `reviewers` is a rename (any caller reading `.reviewer` gets
`undefined`) combined with a type change (string → array). Report this at
CRITICAL, quoting the field and the before/after shape.

Report CRITICAL when the break hits a request or response shape reachable by an
external caller; WARNING when the same change is confined to an internal-only
route or a type not exported publicly.
