## Hand-back 1

## W2a (steps 8-12) done

Gates: `server typecheck`, `lint`, `arch` and `test` all PASS. The test run was 516 passed, with no failures, including the known flaky ones. Nothing is committed. I ran the full suite, not just the inner loop.

### Files changed (all under `/Users/harlock/Downloads/Sites/devdigest/server/`)
- `src/adapters/git/simple-git.ts`
  - Added `readFileAtCommit` and `ensureCommit`.
  - Git runs through `execFile` with `--literal-pathspecs` and an argv array.
  - Reads are limited to modes 100644/100755 and 64 KB.
  - `ensureCommit` is single-flight per clone and SHA, with a 30 s total timeout. It tries a fetch by SHA, then `+pull/<n>/head:pr-<n>`.
- `src/adapters/git/ls-tree.ts` (new) and `ls-tree.test.ts` (new): the `ls-tree -l -z` record parser.
- `src/adapters/mocks.ts`
  - `MockGitClient` implements both methods.
  - New options: `commitFiles` (keyed `"<sha>:<path>"`; a string means ok, an object `{reason}` means a failure) and `ensureCommit`.
  - New recorders: `.ensured` and `.commitReads`.
- `src/modules/_shared/pr-context-paths.ts` (new): `validatePrContextPath`, `buildAttachableList`, `extractSpecReferences`, `computeSuggestions`, `isSpecsDocPath`.
- `src/modules/_shared/pr-context-truncate.ts` (new): `truncateToBudget`, `truncationMarker`, `computeContextFingerprint`.
- `src/modules/_shared/pr-context.ts` (new): the resolver and its helpers.
- Colocated tests: `pr-context-paths.test.ts`, `pr-context-truncate.test.ts`, `pr-context.test.ts`.
- `src/modules/pulls/repository.ts` (new), `context-service.ts` (new), and `routes.ts`, where I only appended the 3 routes.
- `README.md`: route table and diagram label.
- `container.ts` needed no edit. The typecheck errors cleared once `SimpleGitClient` and `MockGitClient` implemented the interface.

### `resolvePrContext()` API for W2b (`src/modules/_shared/pr-context.ts`)
```ts
export async function resolvePrContext(input: ResolvePrContextInput): Promise<ResolvedPrContext>

interface ResolvePrContextInput {
  git: Pick<GitClient, 'ensureCommit' | 'readFileAtCommit'>;   // pass container.git
  tokenizer: Tokenizer;                                         // container.tokenizer
  repo: { owner: string; name: string };
  clonePath: string | null;   // pass `await usableClonePath(repo.clonePath)`; null = not cloned
  pr: { number: number; headSha: string; contextPaths: readonly string[] };
  budget?: number;            // default PR_CONTEXT_TOKEN_BUDGET (10_000)
}

interface ResolvedPrContext {
  entries: PrContextDoc[];   // one per attached path, saved order, de-duplicated
  sent: { path: string; text: string }[];  // attached + truncated only, in prompt order
  tokensSent: number;        // wrapped tokens actually sent; use 16_000 - tokensSent for agent and skill docs
  fingerprint: string | null; // null only when the list is empty
  notes: PrContextNote[];
}

interface PrContextDoc {
  path; kind; origin: 'pr';
  status: 'attached'|'truncated'|'missing'|'too_large'|'unreadable'|'over_budget';
  tokens; text; sha; blobId: string|null; warnings: string[];
}
```
- It never throws and makes no LLM call.
- An empty list makes no git call.
- A null `clonePath` or a bad head SHA makes no git call.
- A failed fetch makes every entry `unreadable`.
- The fingerprint is non-null even when every document is unresolved (Q6).

Other exports from the same file:
- `usableClonePath(clonePath)`: returns null when the clone directory is missing on disk.
- `formatPrContextNote(note)`: a run-log line. Paths go through `sanitizePathForLog` and no git text appears.
- `formatPrContextSummary(resolved)`: returns `pr context: N doc(s) attached (+~T tokens)`.
- `prContextLabel(path)`: returns `pr-context:<path>`.
- `prWrappedTokenCount(tokenizer, path, text)`.
- `dropPrDocsIdenticalToProject(prDocs, projectDocs)`: the AC-24 helper. It returns `{ kept, dropped }`. `projectDocs` are `{ path, status, text }`, i.e. the SPEC-04 `ProjectContextEntry`s. It drops a PR copy only when its git blob id equals the blob id of the default-branch text, computed with `gitBlobId(text)`.

The fingerprint comes from `resolved.fingerprint`. The generic helper is `computeContextFingerprint(items)` in `pr-context-truncate.ts`.

The truncation and over-budget logic lives in `resolvePrContext` and `truncateToBudget`. `truncateToBudget` is exported from `pr-context-truncate.ts`. W2b needs no other helper.

### Notes and deviations
1. **Contract gap (AC-42).** The W1 `PrContextPreview` has only `{ path, status, text, read_from }`. AC-42 also wants kind, origin, tokens and the commit read at. The preview route returns the extra fields `kind`, `origin`, `tokens` and `read_at_sha`; the type is `PrContextPreviewResponse = PrContextPreview & Pick<PrContextEntry,...>`. No response schema strips them. W1 should add them to `PrContextPreview` in both vendor copies. W2d should read them off the response until then.
2. **Origin badges.** `PrContextOrigin` has only `changed | default_branch`. The "added in this PR" vs "modified in this PR" badge of AC-2 can't be produced from the contract. W2d should render `changed`, or W1 should extend the enum, which would also need a `pr_files` status column.
3. **Adapter reason mapping.** `ReadFileAtCommitResult` has no `not_utf8` reason. For a NUL byte or invalid UTF-8 the adapter returns `fetch_failed`, and the resolver maps that to `unreadable` (EC-7). `not_found`, `symlink`, `submodule` and `not_blob` map to `missing` (EC-4, EC-5).
4. **Token counting.** `prWrappedTokenCount` uses the `pr-context:<path>` label, not the `project-context:` one, so the counts match the prompt W2c builds.
5. **Dedupe and budget order.** AC-24 can't be fully resolved inside the resolver. W2b should resolve PR context first, then the project docs with a budget of `16_000 - tokensSent`, then call `dropPrDocsIdenticalToProject` and drop the duplicates from `sent` before sending. The tokens of dropped duplicates stay counted in `tokensSent`, which is slightly conservative.
6. **Save and map-reduce flag.** Save returns the fresh `PrContextResponse`. It de-duplicates the paths, validates each one with UI-1, and caps the list at 20 through the route's `PrContextSaveBody`, so over-20 answers 422. `map_reduce` is true only for an enabled agent with `strategy = 'map-reduce'`; `auto` does not count.
7. **Arch.** `simple-git.ts` imports the PR_CONTEXT constants from `modules/_shared/context-paths.ts`. `arch` still passes. If the architecture reviewer objects, the constants would have to move into the vendor port or adapter config.

### For review
- The security reviewer should look at the git argv construction, the `ls-tree` parser, the path validator and the log-sanitising paths.