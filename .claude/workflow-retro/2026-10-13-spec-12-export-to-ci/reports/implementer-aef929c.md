## Hand-back 1

## W0 report: Q-2 gate — VERDICT: GATE PASS (with one binding condition: copy the WHOLE dist/, especially dist/package.json)

Repo untouched: `git status --short` is still only `?? specs/12-export-to-ci.md`. All work was in scratchpad `.../scratchpad/w0` (build) and `.../scratchpad/w0run` (runs).

**Build** (`npm ci` in agent-runner, then `npm run build` = `ncc build src/index.ts -o dist`; ncc 0.38.4, TS 5.9.3)
- Gotcha: the build fails (TS2307 "Cannot find module 'zod'" plus cascading errors) unless `server/node_modules/zod` exists next to `server/src/vendor/shared`. This is because shared imports `zod` and resolves it from `server/`. I copied it into scratch to mirror the repo. A fresh CI checkout that lacks `server/node_modules` will fail the same way.
- `dist/`: `index.js` 1,606,583 B (unminified ESM), `382.index.js` 5,796 B (lazy chunk), `package.json` 23 B.
- `dist/package.json` is `{ "type": "module" }`.
- `index.js` starts with `import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";`, so it is ESM.
- The `isDirectRun` guard is intact, at line 36033 of `index.js` (`import.meta.url === \`file://${process.argv[1]}\``).
- Chunk 382 is loaded only by the openai SDK's deprecated `fileFromPath`, which the runner never calls.

**Fixture**
- `.devdigest/agents/reviewer.yaml` is valid for `AgentManifest` (name, model, system_prompt, skills `[sec]`, strategy, ci_fail_on).
- `.devdigest/skills/sec.md` and an event JSON, plus `GITHUB_REPOSITORY=acme/payments-api` and `PR_NUMBER=1`.
- No `OPENROUTER_API_KEY` or `GITHUB_TOKEN`.
- The whole `dist/` was copied to `checkout/.devdigest/runner/`, with no `node_modules` anywhere above it.
- The runner honours `DEVDIGEST_DIR`, `DEVDIGEST_POST_AS` and `DEVDIGEST_RESULT_PATH`, and defaults to `cwd/.devdigest`.

**Runs** (all exit 1, which is correct: the process started and the guard fired)

Host node v26.0.0, cwd = checkout:
- `node .devdigest/runner/index.js` (relative, as GitHub runs it) → `[agent-runner] FAILED: GITHUB_TOKEN is required to post as 'github_review'`, exit 1.
- The same with `DEVDIGEST_POST_AS=none` → got past manifest, skill and context loading, then `FAILED: GitHub API error fetching PR diff (...pulls/1): 401 Bad credentials`, exit 1. Manifest, skills and context loading are fine inside the bundle.
- Absolute path → same FAILED line, exit 1.
- `cd .devdigest/runner && node ./index.js` → same FAILED line, exit 1.
- Cwd reached through a symlinked directory (`link -> checkout`, relative path) → same FAILED line, exit 1. The guard still matches.

Docker `node:22` (v22.23.3) and `node:20` (v20.20.2), cwd `/w/checkout`:
- Relative `node .devdigest/runner/index.js`: the default case gives `FAILED: GITHUB_TOKEN is required...`, and `POST_AS=none` gives the GitHub 401 FAILED line. The same holds for `cd` + `./index.js`.
- No ESM, import, chunk or `package.json` errors on either version. Only a harmless `DEP0040 punycode` DeprecationWarning (node 22 only).

**The earlier researcher's claim (a copy of only index.js works)**
- Partially true, and not safe in general.
- It works when the nearest `package.json` above it has no `"type"` or is absent: node 26, node 22 and node 20.20 all use syntax detection (`--experimental-detect-module`, on by default from 20.19 and 22.7). It then reaches the same 401 FAILED line.
- It FAILS when the target repo's root `package.json` has `"type":"commonjs"`. I tested this on node:22 with `only/index.js` and got `SyntaxError: Cannot use import statement outside a module`, exit 1.
- The same layout with the full dist works, because `.devdigest/runner/package.json` (`{"type":"module"}`) overrides the repo's type.
- On a node older than 20.19 or 22.7, or a repo with `"type":"commonjs"`, an index.js-only copy fails.
- The chunk `382.index.js` is not needed at runtime, since its code path is never reached.
- Required for the exporter: ship `index.js` and `package.json` (`{"type":"module"}`). Shipping `382.index.js` too is cheap insurance and I recommend it, but it is optional.

**Risks**
1. The build needs `server/node_modules/zod` (or zod resolvable from `server/src/vendor/shared`). Any CI or build step for the runner must install server deps first.
2. The bundle is 1.6 MB unminified. The generated workflow and the `.devdigest/**` diff stripping already account for it.
3. The guard compares `import.meta.url` to `file://${argv[1]}` as a raw string. It breaks if the path has characters that need URL-encoding (spaces, `#`, `%`), because `import.meta.url` is percent-encoded and `argv[1]` is not. The `.devdigest/runner/index.js` path in a normal repo is fine, but a workspace path with a space would run the process silently with exit 0. Low risk on GitHub (`/home/runner/work/<repo>/<repo>`), and I did not test it.
4. The workflow's `setup-node` should pin node >= 20.19 or 22 (this is moot if `dist/package.json` ships).