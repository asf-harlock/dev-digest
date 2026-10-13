## Hand-back 1

| id | status | evidence |
|---|---|---|
| A1 | fixed | `server/src/adapters/git/simple-git.ts`: the `modules/_shared/context-paths` import is removed. The class now takes a required `SimpleGitClientLimits` second constructor arg (`prContextMaxFileBytes`, `prContextFetchTimeoutMs`). `server/src/platform/container.ts:~96`: injects the existing `PR_CONTEXT_*` constants. `server/src/adapters/git/simple-git.test.ts`: both constructions pass a `LIMITS` object built from the same constants. |

Behaviour is unchanged because the values are the same constants. I didn't touch any vendor files, and nothing is committed.

Gates:
- PASS server:typecheck 3s
- PASS server:lint 1s
- PASS server:arch 1s
- PASS server:test 3s (600 passed)