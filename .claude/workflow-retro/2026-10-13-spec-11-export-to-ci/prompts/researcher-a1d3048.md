External research (docs.github.com primarily; cite URLs). Answer in English, concise (≤ 70 lines).

Question R4, for a local app that uses a user's GitHub token (fine-grained PAT, and note classic PAT scopes too):
(a) Exact fine-grained PAT permissions needed to create a branch, commit a file under `.github/workflows/` via the Git Data API (blobs/trees/commits/refs) or Contents API, and open a pull request. Is the "Workflows" permission required for files in .github/workflows? Classic equivalent (`workflow` scope)?
(b) Permissions to call `GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs`, list run artifacts, and download an artifact zip (`/actions/artifacts/{id}/zip`) — note the redirect behaviour of the download.
(c) Default artifact retention period and limits for `actions/upload-artifact@v4`.
(d) For `on: pull_request` from a branch in the SAME repo: does the run use the PR head's (possibly modified) workflow file and code? Can such a PR thus produce a forged result artifact? For fork PRs: are secrets withheld, GITHUB_TOKEN read-only? What fields of a workflow run (path, head_sha, head_repository, event, actor, pull_requests[]) can a consumer use to verify a run came from the expected workflow on the expected repo, and is there a recommended stronger mechanism (artifact attestations / `actions/attest-build-provenance`)?
(e) Can a workflow's GITHUB_TOKEN submit an APPROVE review on a PR? (known limitation)
Mark anything not confirmed by a doc as unverified.