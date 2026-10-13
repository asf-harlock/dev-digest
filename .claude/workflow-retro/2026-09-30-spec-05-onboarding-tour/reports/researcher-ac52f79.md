## Hand-back 1

## Repository research: file link for an onboarding-tour "Open" button

### Findings
- The Repo DTO and `repos` table carry owner, name, full_name and default_branch. They carry no html_url, remote URL, provider or host field. A GitHub file URL can be built from `full_name` and `default_branch`, but only with github.com hardcoded. The app is GitHub-only today.
- Both vendor copies of platform.ts are byte-identical (`diff` reported no differences).
- A client helper already builds GitHub blob URLs: `githubBlobUrl(repoFullName, sha, file, startLine?, endLine?)`. It takes a `sha` argument, but any ref, including the default branch name, would fit the URL shape. That use is my inference, since the existing callers all pass a PR head SHA.
- One in-app route returns a file's contents by path: `GET /repos/:id/context/file?path=`. It is restricted to project-context docs. A tour could not use it for arbitrary source files.

### Evidence
- `server/src/vendor/shared/contracts/platform.ts:161-172` (client copy is identical) — `Repo = { id, workspace_id, owner, name, full_name, default_branch, clone_path, last_polled_at, created_by }`. There is no url, host or provider field.
- `server/src/db/schema/repos.ts:5-21` — columns are `owner`, `name`, `fullName`, `defaultBranch` (default 'main'), `clonePath`, `lastPolledAt`, `createdBy`, `createdAt`. The remote URL is not stored. `RepoInput` only takes `url` at creation (platform.ts:156-159).
- `server/src/modules/repos/constants.ts:18,24` — `GITHUB_URL_REGEX` and `GITHUB_HTTPS_HOST = 'github.com'`. The server parses only GitHub URLs, both https and ssh forms, at add time.
- `client/src/lib/github-urls.ts:5` — `const HOST = "https://github.com"`.
- `client/src/lib/github-urls.ts:24-37` — `githubBlobUrl` returns `https://github.com/{full_name}/blob/{sha}/{encPath}#L{a}-L{b}`. `encPath` encodes each path segment and keeps `/` separators. `githubPrUrl` is at lines 16-18.
- Existing callers, all in PR detail pages and all passing a PR head SHA:
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:48`
  - `.../BlastRadiusCard/_components/BlastTree/BlastTree.tsx:122`
  - a test at `BlastRadiusCard.test.tsx:233`
- `server/src/modules/context/routes.ts:12,31-37` — `GET /repos/:id/context/file?path=` returns a `SpecFile` with `content`. It is used by the client hook at `client/src/lib/hooks/core.ts:139`.
- `server/src/modules/context/service.ts:67-76` — the route first runs `validateContextPath(path, this.rules)`, which throws `ValidationError` if the path is rejected. It then reads from `repo.clonePath` and throws `NotFoundError('Repository is not cloned')` if there is no clone. I did not read the rules themselves. Given the SpecFile kinds `specs`/`docs`/`insights` (platform.ts:281-282) and the route's "Project Context" purpose, I expect it to reject ordinary source files (unconfirmed).
- `readFile(` hits in `server/src/modules`:
  - `conventions/service.ts:262`
  - `_shared/project-context.ts:64`
  - `repo-intel/pipeline/incremental.ts:154`
  - `repo-intel/pipeline/full.ts:144`
  - `repo-intel/service.ts:763`
  All are internal reads. `repo-intel/service.ts:763` is a helper that returns null on error, and I did not check whether any route exposes it.

### References
- `/Users/harlock/Downloads/Sites/devdigest/server/src/vendor/shared/contracts/platform.ts`
- `/Users/harlock/Downloads/Sites/devdigest/client/src/vendor/shared/contracts/platform.ts`
- `/Users/harlock/Downloads/Sites/devdigest/server/src/db/schema/repos.ts`
- `/Users/harlock/Downloads/Sites/devdigest/client/src/lib/github-urls.ts`
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/repos/constants.ts`
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/context/routes.ts`
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/context/service.ts`

### Could not find
- Any `html_url`, remote URL, provider or host field on the Repo DTO or the `repos` table.
- Any in-app route that serves arbitrary repo source files by path. I did not check `repo-intel` routes beyond the `readFile` grep.
- I did not read `validateContextPath` rules (`server/src/modules/_shared/context-paths.ts`), so the exact set of paths the context route accepts is unconfirmed.
- Whether the default branch recorded at add time can drift from the remote is unconfirmed.

### Implication for the decision
Linking to `githubBlobUrl(repo.full_name, repo.default_branch, path)` needs no contract or DB change. It opens in a new tab on github.com, which is the same behaviour as PR findings. The catch is that it is pinned to the branch tip, not to the commit the tour was generated from. That is unless a commit SHA is stored with the tour, which I did not check.