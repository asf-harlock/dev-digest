## Hand-back 1

## Repository Research: sampling params, cost, and direct invocation of reviewPullRequest

All paths are under /Users/harlock/Downloads/Sites/devdigest. Line numbers come from the files as read at HEAD (branch L06-homework, clean).

### Conclusion
- The review path never sets temperature, top_p or seed. Temperature is left unset by reviewPullRequest and defaulted inside each provider adapter: 0 on every path except GPT-5/o-series on OpenAI, where it is omitted. top_p and seed appear nowhere in the code, so they are always provider defaults.
- Repeated runs on identical input are therefore low-variance but not deterministic, and the code does nothing to pin them.
- Cost (`costUsd`) is the sum over LLM calls of either the real OpenRouter `usage.cost` or a price-table estimate. It is `null` for unknown models.
- `reviewPullRequest` can be called directly with a stored diff and PR text. Only 4 fields are required, but the diff must be a parsed `UnifiedDiff`. There is no PR title field, so the title has to go in `task`.

### Findings

**1. Sampling parameters (temperature, top_p, seed)**
- `reviewPullRequest` calls `input.llm.completeStructured` with only `model`, `schema`, `schemaName`, `messages`, `maxRetries` and optionally `sessionId`. It sets no temperature, maxTokens or timeout (`reviewer-core/src/review/run.ts:196-203`).
- `ReviewInput` has no temperature, top_p or seed field, and neither does the server's `runOneAgent` call (`run.ts:45-112`, `server/src/modules/reviews/run-executor.ts:328-371`).
- `StructuredRequest` exposes only `temperature?`, `maxTokens?`, `timeoutMs?`, `maxRetries?` and `sessionId?`. There is no top_p or seed (`server/src/vendor/shared/adapters.ts:55-70`).
- A grep for `temperature|top_p|topP|seed` over `server/src`, `reviewer-core/src` and `mcp/src` turned up only the adapter lines listed below. top_p and seed appear nowhere. I could not use the Grep tool, so I ran non-recursive `grep` on specific files and directories (see Could not determine for what that did not cover).
- I found no per-agent temperature. The temperature grep over the agent, settings, db-schema, contract and platform files matched nothing.
- Effective defaults per provider, for the structured (review) call:
  - OpenRouter, via `OpenRouterProvider` in reviewer-core: `temperature: req.temperature ?? 0` (`reviewer-core/src/llm/openrouter.ts:73`).
    - `max_tokens` is only sent if provided, which it is not, so the provider's default output cap applies (`openrouter.ts:74`).
  - OpenAI: `tuningParams(req.model, req.temperature, req.maxTokens)` gives `temperature: 0` (`server/src/adapters/llm/openai.ts:36,102`).
    - For models matching `^(gpt-5|o1|o3|o4)`, temperature is omitted entirely, so the provider default applies, and only `max_completion_tokens` is sent if set (`openai.ts:23-35`).
    - The non-structured `complete()` path defaults to 0.2 (`openai.ts:74`). The review does not use it.
  - Anthropic: `temperature: req.temperature ?? 0` and `max_tokens: req.maxTokens ?? 4096` (`server/src/adapters/llm/anthropic.ts:106-107`, `anthropic.ts:17`).
    - The 4096 output cap could truncate a large review. The forced tool-use output must still parse, otherwise it reprompts.
  - Ollama and LM Studio: `temperature: req.temperature ?? 0` (`server/src/adapters/llm/local-openai-compatible.ts:91`).
- Which provider and model a run uses is decided per agent:
  - `this.container.llm(agent.provider)` (`run-executor.ts:234-236`).
  - `model: agent.model` (`run-executor.ts:330`).
  - Providers are built in `server/src/platform/container.ts:172-212`.
- Retries: `maxRetries` defaults to `DEFAULT_REVIEW_MAX_RETRIES = 2` (`run.ts:33,144`). The structured loop runs up to `maxRetries+1` attempts and re-prompts with the previous output plus a validation error (`openrouter.ts:68-119`).
  - The re-prompt path is a second source of variation, and tokens and cost accumulate across attempts.
- The OpenRouter transport also retries: SDK `maxRetries` 2 and timeout 90s (`openrouter.ts:54-55`).
- The OpenAI and Anthropic adapters wrap calls in `withRetry` and `withTimeout` with a 60s default (`openai.ts:15`).

**2. How non-deterministic repeated runs would be**
- The repo contains no determinism measurement.
- Inference from the code (*likely*, not measured):
  - Temperature 0 is greedy-ish decoding but is not guaranteed reproducible on hosted APIs.
  - There is no seed, so identical bytes can still produce different findings, ids, titles or line ranges.
  - Through OpenRouter, the upstream provider is not pinned, because no provider routing parameter is sent (`openrouter.ts:69-89`). Different backends can serve the same model slug.
  - GPT-5/o-series ignore the 0 default entirely (`openai.ts:33-34`).
- Mechanisms that reduce downstream variance:
  - Score and verdict are recomputed deterministically from the grounded findings (`run.ts:226-243`).
  - Grounding drops any finding whose file is not in the diff or whose line range does not intersect a hunk (`grounding.ts:52-84`).
  - Prompt assembly is deterministic text from the same inputs, with no timestamps in the part I read (`reviewer-core/src/prompt.ts:149-232`). Do not rely on that for repo-intel enrichment, which I did not inspect.
- For repeated-run experiments, vary nothing except the sampling. Fix `agent.provider`, `agent.model`, `strategy` and every optional context field, so repo-intel context is not a confound. In the server, callers, repoMap, intent and skills are all derived at runtime (`run-executor.ts:336-364`).
- Other things the server sends that vary per PR are `sessionId` and `task` (`run-executor.ts:260,366`), but both are deterministic for a given PR.

**3. How cost (`costUsd`) is computed**
- Per structured call, `costUsd` is accumulated across the reprompt attempts. Per review, `run.ts` sums it over chunks:
  - Single-pass is one chunk. Map-reduce is one call per file.
  - The total is `null` if any chunk's cost is `null`, otherwise the sum (`run.ts:181,206`).
  - `tokensIn` and `tokensOut` are summed the same way (`run.ts:204-205`).
- OpenRouter (`openrouter.ts`):
  - It requests `usage: { include: true }` so OpenRouter returns real USD in `usage.cost` (`openrouter.ts:82-84`).
  - Costs from all attempts are summed into `costFromApi` (`openrouter.ts:101-103`).
  - The result is `costFromApi ?? this.estimateCost?.(model, tokensIn, tokensOut) ?? null` (`openrouter.ts:112`).
  - In the server, `estimateCost` is injected as `container.priceBook.estimate` (`container.ts:196-199`).
  - `PriceBook` uses live `/models` pricing (USD per 1M tokens, 6h TTL, lazy refresh), falling back to the static table on a cold cache or a non-OpenRouter model. Formula: `(in*promptPerM + out*completionPerM)/1e6` (`server/src/platform/price-book.ts:34-39,5,59-72`).
  - The CI runner passes no estimator, so cost there is only the API's `usage.cost` or `null` (`openrouter.ts:20-23`).
- OpenAI and Anthropic: `estimateCost(model, tokensIn, tokensOut)` from the static table (`openai.ts:122`, `anthropic.ts:135`). The table is `server/src/adapters/llm/pricing.ts:10-35`. Formula: `(tokensIn*in + tokensOut*out)/1_000_000`, and `null` if the model is not in the table (`pricing.ts:37-41`).
  - The Anthropic entries are only claude-3-5-sonnet-latest, claude-3-5-haiku-latest and claude-3-opus-latest. Any other Claude id yields `null`.
  - Pricing comments call the numbers "approximate" (`pricing.ts:11,27-29`).
- Ollama and LM Studio: always `0` (`local-openai-compatible.ts:73,112`).
- Persisted in `agent_runs` and `run_traces.stats.cost_usd` (`run-executor.ts:428-440,455`).
- The cost of one review is not stored as a fixed number. It is roughly (prompt tokens + completion tokens) × the model's price, times the number of attempts and chunks. The prompt is the system prompt, guard, task, PR body, intent, skills and context, plus the diff (`prompt.ts:187-213`).

**4. Calling `reviewPullRequest(ReviewInput)` directly**
- reviewer-core has an explicit zero-I/O invariant: no DB, GitHub, filesystem or `process.env`, with the injected `LLMProvider` as the only side effect (`reviewer-core/CLAUDE.md`, "The invariant"; `run.ts:15-28`).
- Required fields of `ReviewInput` (`run.ts:45-53`):
  - `systemPrompt: string`
  - `model: string`
  - `diff: UnifiedDiff`
  - `llm: LLMProvider`
- Optional fields:
  - `strategy` ('auto' default, `run.ts:145`)
  - `skills`, `memory`, `specs`, `projectContext`, `prContext`, `callers`, `repoMap`
  - `prDescription`, `intent`, `task`
  - `maxRetries`, `mapThresholdLines` (400 default)
  - `sessionId`, `onEvent`, `checkCancelled`
- PR title and body:
  - There is no title field. The server puts the title in `task` via `taskLine(pull)`: `Review pull request #N "<title>" by <author>. ...` (`server/src/modules/reviews/helpers.ts:84-94`).
  - The body goes in `prDescription`. It is truncated to `MAX_PR_DESCRIPTION_CHARS` and delimiter-wrapped as untrusted (`prompt.ts:187-195`, `run-executor.ts:343`).
  - The server's task text asks the model to cite an exact file and line range present in the diff and says zero findings is valid. Copy it if you want parity with a studio run.
- `UnifiedDiff` is a parsed structure, not a raw string (`server/src/vendor/shared/adapters.ts:175-188`):
  - `raw: string`
  - `files: { path, additions, deletions, hunks: DiffHunk[] }[]`
  - each `DiffHunk` is `{ file, oldStart, oldLines, newStart, newLines, newLineNumbers: number[] }`
- A stored diff fragment can be turned into this with the server's pure parser `parseUnifiedDiff(raw)` (`server/src/adapters/git/diff-parser.ts:14-...`). It takes standard `git diff` output with `diff --git`, `+++ b/path` and `@@ -a,b +c,d @@` lines.
  - reviewer-core's own test imports it by relative path (`reviewer-core/test/project-context.test.ts:9`). It is not exported from reviewer-core.
  - The `+++` line sets the file path, and the path is used verbatim (the `b/` prefix is stripped) (`diff-parser.ts:36-40`).
  - Hunk header numbers drive both the prompt and grounding. The prompt gets only `diff.raw`, wrapped as untrusted (`run.ts:164,169`, `prompt.ts:213`).
  - A fragment with no `diff --git` or `+++` line has no file and is filtered out (`diff-parser.ts:... filter((f) => f.path)`).
  - A fragment that starts at `@@` without file headers yields nothing, so the fragment must include the file headers.
- What the grounding gate needs (`reviewer-core/src/grounding.ts:52-84`):
  - Each `Finding.file` must be exactly one of `diff.files[].path` (exact string match, `grounding.ts:54,61`).
  - `[start_line, end_line]` must intersect the new-side line set built from `hunk.newLineNumbers`. If that is empty it falls back to `newStart..newStart+max(newLines,1)` (`grounding.ts:24-39,41-46,72-73`). Both the range and the hunk lines are new-file line numbers, so deletion-only hunks cover only context lines.
  - Exception: findings with `kind` in `secret_leak`, `lethal_trifecta`, `phantom` or `hook` only need the file to be in the diff (`grounding.ts:16,59,66-69`).
  - The gate needs no repo checkout and no file contents, so a stored raw diff with correct hunk headers is sufficient. It does not check that the cited lines are actually in the diff text. Because `newLineNumbers` includes context lines and not just `+` lines, a finding on an unchanged context line also passes.
- After grounding, the outcome is also redacted for secret-shaped strings (`run.ts:243`) and the verdict and score are recomputed (`run.ts:231-243`).
- LLM injection:
  - Any object implementing `LLMProvider.completeStructured` works (`adapters.ts:82-88`).
  - For a real run without the server, use `OpenRouterProvider` from reviewer-core. It is exported, takes an API key, and needs `estimateCost` injected if you want an estimate when OpenRouter does not report cost (`reviewer-core/src/index.ts:67`, `openrouter.ts:46-57`).
  - With `id: 'openai'` plus a `baseURL` it can drive any OpenAI-compatible endpoint (`openrouter.ts:31,49`).
  - Of the other providers, only `OpenRouterProvider` is importable from reviewer-core. The OpenAI and Anthropic adapters live in `server/src/adapters/llm`.
- Mock for tests: `MockLLMProvider` and `MockGitClient` from `server/src/adapters/mocks.ts`. The reference test shows the minimal call: `systemPrompt`, `model`, `diff`, `llm` and `task` (`reviewer-core/test/run.test.ts:1-60`).
- `ReviewOutcome` returns `review`, `grounding` ("k/n passed"), `dropped` (with reasons), `mode`, `assembly`, `chunks`, `tokensIn`, `tokensOut`, `costUsd` (`number | null`) and `raw` (`run.ts:114-132`).
- Strategy: with a single-file diff or `strategy: 'single-pass'` there is exactly one LLM call (`run.ts:134-140`). The studio default is `'single-pass'` (`server/src/modules/reviews/constants.ts:12`, `run-executor.ts:335`), though an agent can override it.
- Output schema: `Review` = `{ verdict, summary, score (int 0-100), findings[] }`. `Finding` requires `id, severity, category, title, file, start_line, end_line, rationale, confidence`, and `suggestion`, `kind` and the others are nullish (`server/src/vendor/shared/contracts/findings.ts:47-83`).
- The `agent.model` and `agent.provider` pair is what the server resolves. This repo has no stored default model for the review path in the files I read, so it is only known per agent.

### Evidence
- `reviewer-core/src/review/run.ts:45-112` — `ReviewInput` definition (required and optional fields, no sampling fields).
- `reviewer-core/src/review/run.ts:114-132` — `ReviewOutcome`.
- `reviewer-core/src/review/run.ts:142-263` — the pipeline: chunking, LLM call at 196-203, cost sum at 206, grounding 219, verdict and score recompute 231-243, redaction 243.
- `reviewer-core/src/llm/openrouter.ts:69-120` — request body (temperature 0, `usage.include`, `session_id`) and the cost fallback chain.
- `reviewer-core/src/grounding.ts:16-84` — grounding gate.
- `reviewer-core/src/prompt.ts:149-232` — prompt assembly; the PR description is sliced to `MAX_PR_DESCRIPTION_CHARS`.
- `server/src/vendor/shared/adapters.ts:35-88` — `CompletionRequest`, `StructuredRequest`, `StructuredResult`, `LLMProvider`; `175-188` — `DiffHunk` and `UnifiedDiff`.
- `server/src/adapters/llm/openai.ts:23-39,100-125` — reasoning-model temperature omission and cost.
- `server/src/adapters/llm/anthropic.ts:17,89-139` — Anthropic defaults.
- `server/src/adapters/llm/local-openai-compatible.ts:77-125` — local defaults, cost 0.
- `server/src/adapters/llm/pricing.ts:10-41` — static price table and `estimateCost`.
- `server/src/platform/price-book.ts:21-73` — live OpenRouter pricing.
- `server/src/platform/container.ts:149-212` — provider construction and `priceBook` wiring.
- `server/src/modules/reviews/run-executor.ts:234-236,328-372,428-455` — how the server builds `ReviewInput` and persists cost.
- `server/src/modules/reviews/helpers.ts:84-94` — `taskLine`.
- `server/src/modules/reviews/constants.ts:12` — `REVIEW_STRATEGY = 'single-pass'`.
- `server/src/adapters/git/diff-parser.ts` — `parseUnifiedDiff`.
- `reviewer-core/test/run.test.ts:1-60` — a working direct-call example with mocks.
- `reviewer-core/test/project-context.test.ts:9,128` — direct use of `parseUnifiedDiff` on a raw string.

### Could not determine
- Actual run-to-run variance: no code, test or doc in the files I read measures it. It needs experiments, for example repeated calls through `reviewPullRequest` with a real provider.
  - Not checked: `evals/` (the evals README says it covers the Claude Code harness), `mcp/`, and `e2e/`.
  - The `evals/` directory might contain review-determinism runs, but I did not open it.
- Which provider and model a given agent uses by default: `agent.provider` and `agent.model` come from the DB agents table and the agent editor, which I did not read. I did not look at seed data or `FEATURE_MODELS` in `contracts/platform.ts`.
- Whether OpenRouter routes a given slug to a pinned upstream provider: the code sends no provider routing parameter, and I did not consult OpenRouter docs, so provider behaviour is unconfirmed.
- Whether the repo-intel inputs (callers digest, repo map, rank note) are stable between runs: I did not read `buildCallersDigest` or `buildRankNote` (`run-executor.ts:251,258,510-600`). Under the studio flow these can differ between runs.
- The grep scope: I could not use the Grep tool or `grep -r`. I grepped specific files and directories in `server/src` (modules/reviews, adapters/llm, vendor/shared, platform), `reviewer-core/src` and `reviewer-core/test`, so I cannot rule out a temperature, top_p or seed elsewhere, for example in other `server/src/modules/*` subfolders or `mcp/`.
  - The one broad temperature check I ran (`grep -ln` over contracts, `modules/*/*.ts`, `db/schema`, `platform`, reviewer-core `src/*/*.ts` and `test`, and `mcp/src/*.ts`) returned only `openrouter.ts`.
  - That pattern misses files nested more than one level deep.
- The `docs/` files in `reviewer-core` and `server` (for example `docs/grounding.md`, `docs/prompt-assembly.md`): not read. My grep for temperature or estimateCost in the reviewer-core docs, README and INSIGHTS files matched nothing.