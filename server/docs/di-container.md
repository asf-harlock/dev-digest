# DI container and adapters

**Purpose:** How dependencies are composed and how tests swap them.

**What belongs here:** the composition root, lazy adapter getters, `ContainerOverrides`, the secrets chokepoint, adding a new adapter behind a port.

**What does not belong here:** anything already covered by the module `README.md`,
and anything volatile enough to go stale within a lesson or two.

The request flow and the adapter diagram are in [`../README.md`](../README.md#request--di-flow) — not repeated here.

## The composition root

- `src/platform/container.ts` is the only place that constructs concrete adapters (`Container` class). `buildApp()` creates one per app: `new Container(config, db, opts.overrides)` and decorates the Fastify instance as `app.container` (`src/app.ts`).
- Adapters live in `src/adapters/<port>/` (`git`, `github`, `llm`, `secrets`, `auth`, `codeindex`, `embedder`, `depgraph`, `tokenizer`, …). `src/adapters/index.ts` is a barrel, not an exhaustive list — `container.ts` imports adapters by direct path.
- Port interfaces (`GitClient`, `GitHubClient`, `LLMProvider`, `SecretsProvider`, …) live in `src/vendor/shared/adapters.ts`. Two exceptions declare the interface inside the adapter file: `Tokenizer` (`adapters/tokenizer/index.ts`) and `DepGraph` (`adapters/depgraph/index.ts`).

## How a dependency is built and taken

`Container` mixes three styles (`container.ts`):

| Style | Members | Shape |
|---|---|---|
| Eager, in the constructor | `secrets`, `auth`, `jobs`, `runBus` | `readonly` fields; `secrets`/`auth` use `overrides.x ?? new Local…` |
| Lazy sync getter | `git`, `codeIndex`, `repoIntel`, `depgraph`, `tokenizer`, `agentsRepo`, `reviewRepo`, `priceBook` | `get x()` — returns the override if set, else builds once into a private `_x` field |
| Lazy async method | `github()`, `llm(id)`, `embedder()` | need a secret, so they `await this.secrets.get(...)`, throw `ConfigError` if the key is missing, and cache the client |

Consumers take the dependency from the container — `container.git.clone(...)` (`modules/repos/service.ts`), `await container.github()` (`modules/polling/routes.ts`). **Never import a concrete adapter class in `src/modules/`**: dependency-cruiser rule `no-concrete-adapter-in-modules` (`.dependency-cruiser.cjs`) fails `pnpm arch`. Exempt: pure parsers, the inline-port files (`tokenizer`, `depgraph`) and `adapters/mocks.ts`.

Shared repositories (`agentsRepo`, `reviewRepo`) are also built here so one module does not import another module's folder.

## Secrets chokepoint

Secrets are read only through `container.secrets` (`SecretsProvider`; default `LocalSecretsProvider`, `adapters/secrets/local.ts`: stored file first, `process.env` fallback). Do not read `process.env` elsewhere — an ESLint `no-restricted-syntax` rule in `eslint.config.mjs` enforces it (exceptions are listed there). Config comes from `AppConfig` (`platform/config.ts`).

Lazy clients cache the key they were built with. After persisting a new key, call `container.invalidateSecretCaches()` — it clears `llmCache`, `_github` and `_embedder`, nothing else.

## `ContainerOverrides` in tests

`ContainerOverrides` (`container.ts`) has optional fields: `secrets`, `auth`, `github`, `git`, `codeIndex`, `embedder`, `llm` (a partial map by provider id), `repoIntel`, `depgraph`, `tokenizer`. An override always wins over the real adapter; for `embedder()` it is checked before the `embeddingsEnabled` gate.

Pass them through `buildApp({ overrides })`, e.g. `overrides: { git: new MockGitClient(), github: new MockGitHubClient() }` (`test/agents-skills.it.test.ts`). Mocks are in `src/adapters/mocks.ts`: `MockLLMProvider`, `MockEmbedder`, `MockGitHubClient`, `MockGitClient`, `MockCodeIndex`, `MockAuthProvider`, `MockSecretsProvider`. There is no mock class for `tokenizer`, `depgraph` or `repoIntel` — tests pass an inline stub (`stubRepoIntel` in `test/blast-route.it.test.ts`).

## Adding a new adapter

1. **Port.** Add the interface to `src/vendor/shared/adapters.ts`. `@devdigest/shared` exists in two copies — change `client/src/vendor/shared/adapters.ts` in the same commit. (A repo-intel-only port may be declared inline in its adapter file, like `Tokenizer`; that is what the `no-concrete-adapter-in-modules` exemption covers.)
2. **Adapter.** Add `src/adapters/<port>/<impl>.ts` implementing it. Take keys via a constructor argument, never `process.env`; vendor SDKs stay inside `adapters/` (rule `no-vendor-sdk-outside-adapters`).
3. **Container.** In `container.ts` add the private `_x` field and a getter (no secret needed) or an async method (secret needed: `this.secrets.get(...)`, `ConfigError` if absent). Check `this.overrides.x` first. If it holds a secret-derived client, reset it in `invalidateSecretCaches()`.
4. **Override.** Add `x?: Port` to `ContainerOverrides`.
5. **Mock.** Add `MockX implements Port` to `src/adapters/mocks.ts` (deterministic, no network); optionally export the real class from `src/adapters/index.ts`.
6. **Consume.** Use `container.x` / `await container.x()` from a service or route; get the container from the constructor or `app.container`.
7. **Verify.** Write a test passing the mock via `buildApp({ overrides })`, then run `pnpm typecheck`, `pnpm lint` and `pnpm arch`.

- [ ] Port in both `vendor/shared` copies
- [ ] Getter/method in `container.ts`, override checked first
- [ ] Field in `ContainerOverrides`, mock in `mocks.ts`
- [ ] No concrete adapter import and no `process.env` in `src/modules/`
- [ ] `invalidateSecretCaches()` updated if it caches a secret-derived client
