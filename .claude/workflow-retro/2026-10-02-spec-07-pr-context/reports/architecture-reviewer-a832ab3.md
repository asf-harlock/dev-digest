## Hand-back 1

## Architecture review: server, client, reviewer-core, e2e (SPEC-07 PR Context)

### Deterministic check results
- `cd server && pnpm arch`: pass. 213 modules and 739 dependencies cruised, no violations.
- `cd client && pnpm arch`: pass. 586 modules and 1819 dependencies cruised, no violations.
- reviewer-core and e2e: no machine gate exists for either module. I grepped `reviewer-core/src` for `fs`, `node:`, `process.env` and `pg` imports and found none. The e2e diff is a single flow JSON edit.

### Findings
| Severity | File:Line | Rule | Rationale | Suggestion |
|---|---|---|---|---|
| WARNING | server/src/adapters/git/simple-git.ts:18-21 | Layering, adapter must not depend on module | A concrete adapter now imports `PR_CONTEXT_*` constants from `../../modules/_shared/context-paths.js`. At the base commit this file had no `modules/` import, so the dependency is new. dependency-cruiser allows it because the L3 infra rules don't forbid adapter → `modules/_shared`. The direction is still inverted: infra depends on the module layer. `context-paths.ts` is documented as "SPEC-04 pure path rules" for modules. Confidence is 0.7, and it is capped at WARNING because the rule is `[Convention]`. | Pass the limits to the adapter through its constructor or the port, or move the pure constants to `core/` or `adapters/git/`, and have `_shared` re-export them. |
| SUGGESTION | server/src/modules/reviews/service.ts:172-181 | Workstream placement | This is a 2-line edit that threads `contextFingerprint` from `classifyIntent` into `upsertIntent`. It is consistent with the `intent-classifier.ts` and `pull.repo.ts` changes, and it adds no layering violation. | None. Confirm it is in the approved scope. |

Clean:
- **Vendor hunks:** the SPEC-07 hunks in `contracts/{brief,platform,review-api,trace}.ts` are identical in the server and client copies. The `adapters.ts` additions (`readFileAtCommit`, `ensureCommit`, `ReadFileAtCommitResult`, `EnsureCommitResult`) have identical content in both. Only the surrounding context and line numbers differ, because of the pre-existing drift.
- **`modules/pulls/repository.ts`:** it imports only drizzle and the db schema.
- **`modules/pulls/context-service.ts`:** it takes the container and uses `_shared` and its own repository. It has no cross-module or concrete-adapter import.
- **`modules/_shared/pr-context*.ts`:** it takes the `Tokenizer` port type and `GitClient` from shared, and uses `node:crypto` only. It has no adapter or db import.
- **Client:** `ContextTab` and the `PrContext*` components fetch only through `usePrContext` in `client/src/lib/hooks/pr-context.ts`. The hooks file imports `api` and shared types only.
- **reviewer-core:** the diff (`prompt.ts`, `review/run.ts`, `index.ts`) has no I/O.

### Grounding note
- The simple-git finding is judged from prose. The `server/.dependency-cruiser.cjs` header names the L3 infra layer, but no rule covers adapter → `modules/_shared`.
- The reviewer-core and e2e conclusions rest on grep against their `CLAUDE.md` prose. No tool backs them.

```findings-json
{
  "reviewer": "architecture",
  "findings": [
    {
      "severity": "WARNING",
      "title": "Git adapter imports PR_CONTEXT constants from modules/_shared",
      "file": "server/src/adapters/git/simple-git.ts",
      "start_line": 18,
      "end_line": 21,
      "rationale": "Adapter (L3 infra) now depends on the module layer (modules/_shared/context-paths.ts). This import was absent at base 896f72b. dependency-cruiser does not flag it because the config has no rule against it. [Convention] layering, so capped at WARNING.",
      "suggestion": "Inject the limits (max bytes, fetch timeout) via the adapter constructor or port, or move the pure constants to a layer both can import and re-export from _shared.",
      "confidence": 0.7
    }
  ]
}
```