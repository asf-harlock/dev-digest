# Semver discipline

Apply this skill to any diff that changes the public API contract AND touches
a version marker — package version, an API version header/constant, or a
CHANGELOG entry. Judge whether the size of the bump matches the size of the
change, using standard semver semantics: **MAJOR** for anything a caller can
break against, **MINOR** for backward-compatible additions, **PATCH** for a fix
that changes no contract.

Checklist:
- A change flagged CRITICAL or WARNING by `breaking-change`/`response-schema`
  ships with anything less than a MAJOR bump → flag it. This is the dangerous
  direction: an automatic dependency/client upgrade on a minor/patch range now
  pulls in a break.
- A purely additive, backward-compatible change (new optional field, new
  endpoint, new enum value nobody has to switch on) ships with a MAJOR bump →
  flag it as a SUGGESTION. Not dangerous, but it trains callers to stop
  trusting major bumps as a real signal.
- No version marker touched at all, on a diff that changes the contract → flag
  it; callers have no way to know a bump happened.

Do not require a bump for internal-only route changes, non-exported types, or
test/fixture changes — the contract is what callers outside the service see.

## Good example
```diff
- "version": "2.3.1",
+ "version": "3.0.0",
```
```diff
 export const PullSummary = z.object({
   id: z.string(),
-  status: z.enum(['open', 'closed']),
+  status: z.enum(['open', 'merged', 'closed', 'draft']),
+  title: z.string().min(1).max(500),   // was unbounded
 });
```
Adding constraints to an existing required field (`.min(1).max(500)`) can
reject previously-valid payloads — that's a real break, and the diff bumps
MAJOR to match. Nothing to report.

## Bad example
```diff
- "version": "2.3.1",
+ "version": "2.4.0",
```
```diff
 export const PullSummary = z.object({
   id: z.string(),
-  reviewer: z.string(),
+  reviewers: z.array(z.string()),
 });
```
Renaming and retyping `reviewer` → `reviewers` is a breaking change, but the
bump is MINOR. A caller pinned to `^2.3.1` auto-upgrades into a break they
never opted into. Report at WARNING (CRITICAL is reserved for the contract
break itself, already reported by `breaking-change`) and name the correct
bump: this diff needs `3.0.0`.
