## Hand-back 1

## Repository Research: R2 — can agent-runner's ncc bundle run alone as `node <dir>/index.js`?

### Conclusion
Not tested. The researcher guard denied `node` (and the copy/install/build commands), so I could not copy, build, run, measure bytes or report `node -v`. Everything below is static reading plus one prior in-repo claim. The output format (ESM vs CJS) and whether the direct-run guard fires are open, and both look risky.

### Findings (static, not run)
- **Package manager:** the package has both `package-lock.json` and `pnpm-lock.yaml`. `agent-runner/CLAUDE.md` does not say which to use. The root CLAUDE.md says `e2e/`, `reviewer-core/` and `mcp/` use npm and `server/`, `client/` and `evals/` use pnpm, and does not list `agent-runner/`. `INSIGHTS.md` uses `pnpm`.
- **Build:** the script is `ncc build src/index.ts -o dist` (`agent-runner/package.json:9`). `@vercel/ncc ^0.38.3` resolves to 0.38.4 per `agent-runner/insights/INSIGHTS.md` (Tool & Library Notes).
- **Package type:** `"type": "module"` (`package.json:5`). The ncc 0.38.4 readme says a `.js`/`.mjs` input inside a `"type": "module"` boundary gets ES module output automatically. That is documented for `.js`/`.mjs`; I did not confirm it applies to a `.ts` entry. That makes the bundle likely ESM, but I could not confirm it.
- **Extra files:** the ncc readme says nothing about emitting a `dist/package.json` or chunks. I could not confirm whether `dist/` holds extra files, and I could not search for `.node` binaries. The prior session notes (`INSIGHTS.md` "What Works") claim "zero top-level import/require" and say `node dist/index.js` runs standalone. They do not mention extra files or file size, and they ran it from inside the repo (`dist/` is gitignored, `.gitignore`), not in an isolated directory.
- **Risk if ESM:** if ncc emits an ESM `dist/index.js` with no sibling `package.json`, a copied-alone `index.js` has no `"type":"module"`. Whether Node then loads it depends on its syntax detection (`--experimental-detect-module`, default-on in newer Node 22; unverified). Node 20 likely would not detect it (unverified), so it would fail to parse (`Cannot use import statement` / `import.meta`).
- **Direct-run check** (`agent-runner/src/index.ts:65-68`): `import.meta.url === \`file://${process.argv[1]}\``. In the bundle, this is silent do-nothing if:
  - ncc rewrites `import.meta.url` to something not equal to `file://<argv1>`; or
  - the path contains spaces or other URL-encoded characters, or `argv[1]` is a symlink or relative path; or
  - it was run via a loader.
  There is no `else` branch, so a mismatch means no output and exit 0. On a plain absolute path with ESM output it should match. Not verified.
- **Expected failure with no env:** it would not be a missing-env error. `main()` (`index.ts:30-61`) builds `OpenRouterProvider('')` and calls `runCi`. `runCi` first does `loadManifest(deps.devdigestDir, …)` (`run.ts:93`), with `devdigestDir` defaulting to `<cwd>/.devdigest` (`index.ts:31`). It would fail there first, printing `[agent-runner] FAILED: <manifest error>` and exit code 1. The `GITHUB_TOKEN is required` error (`run.ts:99-102`) comes after manifest load and `resolvePrContext`, so it is not the first failure. Silent no-op vs this FAILED line is how to tell whether the guard fired.
- **Beside `index.js`:** at runtime only the target repo's `.devdigest/agents/*.yaml` and `.devdigest/skills/*.md` in cwd, plus env vars `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `PR_NUMBER`, optional `DEVDIGEST_DIR`, `DEVDIGEST_RESULT_PATH` and `DEVDIGEST_POST_AS`. It uses global `fetch`, so it needs Node 18+. I found no `setup-node` or workflow generator under `server/src/modules/ci/` (the grep returned nothing, and `workflow.ts` does not exist at that path), so the Node version in the generated workflow is unconfirmed.
- **Sibling sources for the scratch copy** (`tsconfig.json:21-26`): `../server/src/vendor/shared/` and `../reviewer-core/src/`. `reviewer-core` needs its own `node_modules` for `zod`/`openai` resolution (`INSIGHTS.md` "What Doesn't Work"). Because ncc resolves from the importing file's directory, the scratch copy needs `reviewer-core/node_modules` installed too, not just `agent-runner/node_modules`.
- **Repo state:** no `node_modules` anywhere in the worktree, so I could not read ncc's source locally.
- **Doc gap:** `agent-runner/CLAUDE.md` points to `insights/gotchas.md`, which does not exist (only `INSIGHTS.md`).

### Evidence
- `agent-runner/package.json:5,9` — `type: module`, ncc build script.
- `agent-runner/src/index.ts:31,65-70` — default `devdigestDir` and the `isDirectRun` guard with no else branch.
- `agent-runner/src/run.ts:93,99-102,167-171` — manifest load first, token check later, hard-fail returns exit code 1.
- `agent-runner/insights/INSIGHTS.md` ("What Works", "Tool & Library Notes") — prior unverified-here claims about standalone run and the ncc version.
- ncc 0.38.4 readme: https://cdn.jsdelivr.net/npm/@vercel/ncc@0.38.4/readme.md — ESM auto-output inside a `type: module` package; silent on `import.meta` and on an emitted `package.json`.

### Could not determine
- `node -v` and Node 20 behaviour (the `node` command was denied by the guard).
- Whether the bundle is ESM or CJS, exact byte size, whether `dist/` holds extra files, and whether the direct-run guard fires. All of these need an actual build and run. I could not copy, install, build or run anything, since the guard permits none of those commands.
- Suggested commands for the caller to run in the scratch dir, with a copy of `agent-runner/`, `reviewer-core/` and `server/src/vendor/shared/` kept in the same relative layout:
  - `cd reviewer-core && npm ci`, then `cd ../agent-runner && npm ci && npm run build`
  - `ls -la dist; head -c 300 dist/index.js; wc -c dist/index.js`
  - `mkdir /tmp/x && cp dist/index.js /tmp/x/ && (cd /tmp/x && node index.js; echo exit=$?)`
  - Repeat under Node 20 (`nvm use 20`).