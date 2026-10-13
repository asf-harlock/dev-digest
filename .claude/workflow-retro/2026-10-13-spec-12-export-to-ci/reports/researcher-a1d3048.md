## Hand-back 1

## External Research: GitHub token permissions and CI-artifact trust for a local app that exports to CI (R4)

Docs checked are the current docs.github.com pages, fetched 2026-10-12. Fine-grained permission names come from the REST permissions tables. Anything labelled "unverified" has no explicit statement in a doc I fetched.

### Conclusion
A fine-grained PAT needs Contents write, Pull requests write and Actions read. It also needs Workflows write if the commit touches `.github/workflows/` (the doc-backed part is the Workflows table; the exact trigger is unverified). A classic PAT needs `repo` plus `workflow`. A same-repo `pull_request` run can be forged by the PR author. Treat the artifact as untrusted unless it carries an attestation, or at minimum check `path`, `head_sha`, `head_repository` and `event`. A workflow `GITHUB_TOKEN` approving PRs is blocked by default.

### Findings

**(a) Create branch, commit a workflow file, open a PR**
- Fine-grained PAT, repository permissions, per the permissions table:
  - Create ref (`POST git/refs`): Contents write.
  - Create blob, tree and commit: Contents write.
  - Create or update file (`PUT contents/{path}`): Contents write.
  - Create PR (`POST pulls`): Pull requests write.
  - Metadata read is implicit (unverified, not on the page).
- The "Workflows" repository permission is documented only as an endpoint table:
  - `PUT` and `DELETE contents/{path}`, `POST` and `PATCH git/refs`, `POST` and `PATCH releases`, all at write access with the "additional permissions" checkmark.
  - The checkmark means the endpoint needs more than one permission or any one of a set.
- Conclusion on Workflows: the rows that appear under both Contents and Workflows are the ref and contents-file writes. Blobs, trees and commits are Contents-only with no checkmark.
- Unverified: no page I fetched says "Workflows is required for files under `.github/workflows/`". Inference: it is needed when a ref create or update, or a contents `PUT`, introduces or changes a workflow file. Plan to request Workflows write for an "export workflow" feature. A community thread says Workflows alone did not fix the error for one user (anecdotal).
- Classic PAT: `repo` is required, and "The workflow scope is also required in order to modify files in the .github/workflows directory" (contents page).
  - `workflow` scope: "Grants the ability to add and update GitHub Actions workflow files."
  - `public_repo` limits access to public repos.
- No doc I fetched covers the classic scope required for the Git Data (blobs, trees, commits, refs) endpoints. Assume `repo` and `workflow` (unverified).

**(b) Runs and artifacts**
- Fine-grained PAT, Actions read for:
  - `GET .../actions/workflows/{id}/runs`
  - `GET .../actions/runs/{run_id}/artifacts`
  - `GET .../actions/artifacts`
  - `GET .../actions/artifacts/{id}/zip`
- Classic PAT: `repo` for private repos. For public repos, anyone with read access can list and get artifacts. The download and delete section also says "need the `repo` scope".
- `workflow_id` may be the numeric ID or the file name (for example `main.yaml`).
- Run filters: `event`, `head_sha`, `branch`, `actor`, `status`, `created`, `exclude_pull_requests`. Filtered searches return at most 1,000 results.
- Download returns `302 Found` with the `Location` header. The redirect URL "expires after 1 minute", and an expired or deleted artifact returns `410 Gone`.
  - `curl -L` is the docs' example for following the redirect.
  - Unverified: whether to drop the `Authorization` header on the second hop. The docs do not say, so follow the redirect manually and request the `Location` URL without the token (common practice).
- Artifact objects carry `expired`, `created_at` and `expires_at`.

**(c) Retention and limits for `upload-artifact@v4`**
- Default retention is 90 days. `retention-days` accepts 1 to 90, and 0 means the repo default (upload-artifact README).
- The repo setting can change the range: public repos 1 to 90 days, private repos 1 to 400 days (Actions settings page).
- The settings page says the policy will also cover checks, workflow runs and commit statuses from 2026-10-01.
- Limit of 500 artifacts per job (README). The caller's "10 per job" figure was not in the README; that figure comes from older upload-artifact v4 docs and I could not confirm it today.
- v4 artifacts are immutable. Names must be unique per run, and `overwrite: true` replaces the artifact with a new ID.
- Hidden files are excluded by default (`include-hidden-files: false`). Zip upload resets permissions to 755 for directories and 644 for files. `compression-level` is 0 to 9 with a default of 6.
- Storage quota can block uploads. Not on GHES.
- Per-artifact size limit: not stated in the README (unverified).

**(d) Trust in a run**
- `pull_request` runs against the merge commit: "`GITHUB_SHA` ... is the last merge commit of the pull request merge branch", with `GITHUB_REF` = `refs/pull/N/merge`. The events page does not explicitly say the workflow file comes from the PR merge ref. The `pull_request_target` text contrasts with "the merge commit, as the `pull_request` event does". Inference: a same-repo PR runs its own, possibly modified, workflow and code. This is well known but not stated verbatim in the doc.
- Consequence: anyone who can push a branch and open a PR can make that workflow upload a forged result artifact. The artifact is not trustworthy on its own.
- Workflows do not run on PRs with merge conflicts. `pull_request_target` does, and runs in the base default-branch context.
- Secure-use docs: workflows triggered on `workflow_run` "should treat artifacts uploaded from other workflows with caution".
- Fork PRs:
  - Secrets are not passed, except `GITHUB_TOKEN`.
  - `GITHUB_TOKEN` is read-only.
  - First-time contributors may need maintainer approval.
  - Dependabot PRs are treated like forks.
  - The "Send write tokens" and "Send secrets to workflows from pull requests" options exist for private repos only.
- Run fields a consumer can check (workflow-runs API schema):
  - `path`: the workflow file path. It is the file at the run's commit, so it is only meaningful together with the ref.
  - `head_sha` and `head_repository` / `head_repository_id`: compare against the expected repo and commit.
  - `event`: for example `pull_request` vs `push`.
  - `actor`.
  - `pull_requests[]`: with `head`/`base` ref, sha and repo. It may be empty for fork PRs (unverified; not in the schema text).
  - `referenced_workflows[]`: path, sha and ref.
  - None of these proves the workflow file content is trusted. Checking `path`, `head_repository` and `event` mostly proves where the run came from. The check can still pass for a forged run inside the same repo, because a PR branch can use the same path.
- Stronger mechanism: artifact attestations (`actions/attest-build-provenance`).
  - Signed claims linking the artifact to the workflow, repo, org, commit SHA, triggering event and environment.
  - Required workflow permissions: `id-token: write`, `contents: read`, `attestations: write`.
  - Verify with `gh attestation verify <file> -R owner/repo`. The CLI manual lists `--repo`, `--owner`, `--signer-workflow`, `--signer-repo`, `--cert-identity`, `--source-ref`, `--source-digest` and `--predicate-type` (default `https://slsa.dev/provenance/v1`). The signer-workflow and source-ref flags are what let a consumer pin the expected workflow and branch.
  - Attestations alone give SLSA Build L2. L3 needs a reusable workflow.
  - Private repos need GitHub Enterprise Cloud. Public repos work on all current plans.
  - `attest-build-provenance` v4 is a wrapper around `actions/attest`, and new work should use `actions/attest`.
  - Caveat: a PR author can modify the workflow so that it still attests, so pin the signer workflow and ref (for example `--source-ref refs/heads/main`). `--source-ref` and `--source-digest` do not appear in the GitHub-docs verify page, only in the CLI manual.
  - Unverified: that a PR-ref attestation would be rejected by `--source-ref refs/heads/main`. The doc says the flag enforces the git ref but gives no PR example.

**(e) Can `GITHUB_TOKEN` approve a PR?**
- By default no. The setting "Allow GitHub Actions to create and approve pull requests" governs it. For personal-account repos "workflows are not allowed to create or approve pull requests". Admins can toggle it, but an org or enterprise policy can override it.
- GitHub changelog 2022-05-03 says the setting was widened to also limit PR creation. The changelog gives no default.
- The `permissions` key lists `pull-requests`, but the doc only gives the label example and says nothing about approval.
- Another path, a user's PAT calling `POST /pulls/{n}/reviews` with `event=APPROVE`, needs Pull requests write. The reviews page does not say whether self-approval is blocked (unverified). It is generally blocked for the PR author (unverified).

### Sources
- Permissions required for fine-grained PATs — https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens — Contents, Pull requests, Actions and Workflows rows.
- Permissions required for GitHub Apps — https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps — same endpoint tables.
- Contents API — https://docs.github.com/en/rest/repos/contents — classic `repo` and `workflow`.
- Scopes for OAuth apps — https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps — `workflow`, `repo` and `public_repo` definitions.
- Artifacts REST — https://docs.github.com/en/rest/actions/artifacts — 302, 1-minute expiry, 410.
- Workflow runs REST — https://docs.github.com/en/rest/actions/workflow-runs — fields and filters.
- upload-artifact README — https://github.com/actions/upload-artifact — v4 behaviour, 90 days, 500 per job.
- Managing GitHub Actions settings — https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository — retention range, fork policies, PR approve setting.
- Events that trigger workflows — https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows — `pull_request`, forks, `pull_request_target`.
- Secure use — https://docs.github.com/en/actions/reference/security/secure-use — `workflow_run` and artifact caution.
- Workflow syntax — https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax — permission names and fork behaviour.
- Artifact attestations concept — https://docs.github.com/en/actions/concepts/security/artifact-attestations — what attestations contain.
- Using artifact attestations — https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations — required permissions.
- actions/attest-build-provenance — https://github.com/actions/attest-build-provenance — v4 wrapper.
- `gh attestation verify` manual — https://cli.github.com/manual/gh_attestation_verify — verify flags.
- Changelog 2022-05-03 — https://github.blog/changelog/2022-05-03-github-actions-prevent-github-actions-from-creating-and-approving-pull-requests/ — widened setting, no default stated.
- Secondary: community discussion https://github.com/orgs/community/discussions/160497 — Workflows alone may not suffice; anecdotal.

### Could not determine
- Whether Workflows write is required for `.github/workflows/` content or only for ref and contents writes touching it. The permission definition text was not found in docs.
- The classic-scope requirement for Git Data endpoints specifically.
- The authoritative doc line that same-repo `pull_request` uses the PR's workflow file.
- Whether the artifact-zip redirect should be followed with or without the `Authorization` header.
- Attestation behaviour for PR-ref builds against `--source-ref`.
- A per-artifact size limit.
- The "10 artifacts per job" figure in older v4 docs.
- The `pull_requests[]` behaviour for fork runs.
- The default value of the approve-PR setting for orgs.
- The self-approval behaviour of the reviews API.