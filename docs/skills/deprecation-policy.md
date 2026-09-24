# Deprecation policy

Apply this skill whenever the diff removes a route, a response/request field,
or an enum value that could be observed by a caller outside this service. The
house rule: nothing public disappears in the same PR that stops recommending
it. A caller needs a window — a release where the old and new shape both work,
and a signal that the old one is going away — before it can actually be
removed.

What counts as a proper deprecation, in decreasing order of strength:
1. The old field/route still WORKS, is marked `deprecated: true` (or the
   equivalent in this codebase's contract format), and the response carries a
   machine-readable signal (a `Deprecation`/`Sunset` header, or a documented
   sunset date/version in the CHANGELOG).
2. At minimum, a CHANGELOG or release-notes entry naming the field/route, why,
   and what replaces it, published in a release BEFORE the removal.

What does NOT count, and should be flagged:
- The field/route is deleted in this diff with no prior PR that marked it
  deprecated — a silent removal, however small the diff looks.
- A `deprecated: true` marker is added AND the underlying field/route is
  removed in the SAME diff — the marker never reached a caller before the
  removal did.
- The replacement lands, but the old field/route also changes shape
  immediately (rather than continuing to work as-is) — callers mid-migration
  break too.

## Good example
```diff
 export const AgentDetail = z.object({
   id: z.string(),
-  ciFailOn: z.enum(['never', 'critical', 'warning', 'any']),
+  /** @deprecated use `gate_policy` instead; removed in a future major version. */
+  ciFailOn: z.enum(['never', 'critical', 'warning', 'any']),
+  gate_policy: z.enum(['never', 'critical', 'warning', 'any']),
 });
```
The old field keeps working, is marked deprecated, and a replacement exists
alongside it. Nothing to report here beyond confirming the CHANGELOG names a
removal target version.

## Bad example
```diff
 export const AgentDetail = z.object({
   id: z.string(),
-  ciFailOn: z.enum(['never', 'critical', 'warning', 'any']),
+  gatePolicy: z.enum(['never', 'critical', 'warning', 'any']),
 });
```
`ciFailOn` is deleted outright and replaced by a renamed field in the same
PR — any caller reading `ciFailOn` gets `undefined` the moment this ships,
with no warning beforehand. Report at CRITICAL if the field is reachable
outside this service; the fix is to keep `ciFailOn` working (aliased to the
new field) for at least one deprecation window and land the rename as its own
follow-up removal PR.

Report CRITICAL when the removed surface is externally reachable and had no
prior deprecation signal at all; WARNING when a deprecation marker existed but
the removal came too soon or in the same PR as the marker.
