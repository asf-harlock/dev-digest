# Finding rules

Source of truth is `scripts/lib/rules.mjs` (thresholds in `THRESHOLDS`); this
file explains each rule so a finding can be judged, not just read. Keep the two
in step. A rule states a **fact with evidence**; whether to act on it is Step 3.

`Conf.` is `certain` when the evidence settles it, `verify` when it rests on the
text scan or a runtime assumption and **must be checked before it is scheduled**.

## Rules

| Rule | Fires when | Severity | Conf. |
|---|---|---|---|
| `BOUNDARY_BYPASS` | a **relative** import resolves into a sibling module's directory (`../../server/src/...`) instead of going through a tsconfig path alias or the module's public entry point | `high` from runtime source, `medium` from tests/config | certain |
| `PHANTOM` | a package is imported but not declared in that module's `package.json` | `high` if imported from runtime source, else `medium` | certain |
| `PLACEMENT` | (a) a `devDependency` is imported from runtime source; (b) a `dependency` is used only by tests, config, scripts or as `@types/*` | (a) `high`, `low` in a bundled app · (b) `medium` if ≥ 5 MB exclusive, else `low` | (a) certain · (b) verify, certain for `@types/*` |
| `DUAL_INSTANCE` | module A compiles module B's source through a tsconfig alias, and that source imports a package both A and B install | versions differ `high` · same version, pinned in A's tsconfig `info` · same version, unpinned: `medium` for `zod`/`react`/`react-dom`/`@tanstack/react-query`, else `low` | verify |
| `UNUSED` | a declared package has no import, string reference, config mention, script binary or `@types` link | `medium` if ≥ 5 MB exclusive, else `low`; `info` when another declared dependency already installs it (a peer) | verify |
| `MULTI_VERSION` | one package name is installed at ≥ 2 versions in a module, and the duplicate copies cost ≥ 512 KB | `medium` ≥ 3 MB on the runtime path, otherwise `low`; a tool's own platform binaries (`@esbuild/*`) are folded into the tool | verify |
| `CROSS_MODULE_DRIFT` | the same direct dependency resolves to different versions in different modules | `medium` if the major differs, else `low` | certain |
| `HEAVY` | a direct dependency's **exclusive** size ≥ 30 MB (`medium`) / ≥ 10 MB (`low`) on the runtime path, or ≥ 50 MB (`low`) in dev tooling | as listed | verify |
| `VENDOR_DRIFT` | a `src/vendor/<name>/` directory exists in two modules and the copies differ | `info` | certain |
| `NOT_INSTALLED` | a module has a lockfile but no `node_modules` | `info` | certain |
| `VULN` *(online)* | the module's `audit` reports an advisory | `critical`/`high` → `high`, `moderate` → `medium`, `low` → `low` | certain |
| `DEPRECATED` *(online)* | a direct dependency is marked deprecated on the registry | `medium` | certain |
| `OUTDATED` *(online)* | a direct dependency is ≥ 1 **major** behind `latest` (minor/patch lag is not reported) | `low` | certain |

## Known false positives — check these first

- **`BOUNDARY_BYPASS`** only fires when the relative path lands in another top-level module that has its own `package.json`; a path inside the same module, or into `node_modules`, never counts. The runtime-source/tests split is by file name, not by whether the importing file ships.
- **`PHANTOM`** comes from a regex over source text. Code inside a template
  literal is skipped, but an `import` written in a block comment or built from a
  string can still match. A name that is not a valid npm package name is dropped.
- **`PLACEMENT` (a) in `client/`, `e2e/`, `evals/`** — a Next.js app bundles at build time, where
  devDependencies are installed, and a tooling-only package is never installed with `--prod`; the
  rule drops to `low` for both. It stays worth a look only if an SSR step or server runtime loads it.
- **`UNUSED`** misses implicit use: a plugin loaded by name from a config the
  scanner does not read, a CLI called only from CI, a peer another package
  needs. `server/package.json`'s `pino-pretty` is loaded as `target: 'pino-pretty'`
  — the scanner counts a quoted name anywhere as a reference, so that one passes.
  A package pulled in by another direct dependency is `info`: removing the
  declaration frees nothing.
- **`DUAL_INSTANCE`** assumes the bundler resolves a bare import from the
  importing file's directory (true for `tsc` `Bundler` resolution, Vite/Vitest,
  `tsx`, Next). If the module aliases the package to one copy, the finding is
  `info`. The real-world consequence is `instanceof` and singleton breakage —
  this is the "zod can be loaded twice" trap in the root `CLAUDE.md`.
- **`MULTI_VERSION` for dev tooling** (e.g. four `esbuild` versions via
  `drizzle-kit`, `tsx`, `vitest`) never ships; it costs disk and install time
  only. It is capped at `low`.
- **`HEAVY`** reports weight, not waste. `next`, `react-dom`, `typescript`,
  `mermaid` are heavy because of what they do. The question is whether a lighter
  alternative or lazy loading exists, not whether the number is large.

## What the scanner reads

- Static `import … from`, `export … from`, side-effect `import 'x'`, dynamic
  `import('x')` (a leading block comment is allowed), `require('x')`,
  `vi.mock('x')`, and CSS `@import` / `@plugin`.
- Quoted package names in root-level `*.config.*`, `tsconfig*.json` and in
  `package.json` `scripts`; installed `bin` names against `scripts`.
- Skipped directories: `node_modules`, `dist`, `.next`, `coverage`, `clones`,
  `test-results`, `build`, `out`, `docs`, `specs`, `messages`, and anything
  dot-prefixed. Files over 1 MB are skipped.
- **Test files** are `*.test.*`, `*.spec.*` and anything under `test/`, `tests/`,
  `__tests__/`, `__mocks__/`. **Config files** are root-level `*.config.*` and
  all `.css`. Everything else is **src**.
- tsconfig `paths` aliases (`@/…`, `@devdigest/shared`) are not packages — except
  an alias that points into `node_modules`, which is a *pin* of a real package.
