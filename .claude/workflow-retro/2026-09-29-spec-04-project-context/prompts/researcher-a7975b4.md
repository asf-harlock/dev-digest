In the repo /Users/harlock/Downloads/Sites/devdigest (DevDigest; `main` is a trimmed course starter), find out whether there is a CI or runner review path outside `server/src/modules/reviews/run-executor.ts` that calls `reviewPullRequest`, either today or in git history. If there is, report how it resolves skills and specs: does it read from the filesystem of the repo checkout, or call the API?

Search with:
- `grep -rn "reviewPullRequest\|AgentManifest" --exclude-dir=node_modules .`
- `.github/`
- `server/src/vendor/shared/contracts/eval-ci.ts`
- `git log -S 'AgentManifest' --oneline --all`, then inspect the hits with `git show`

Also read the comment near `reviewer-core/src/review/run.ts:26-27` about "fs in the runner".

Report back:
- Whether this path exists now or existed historically, with the commit shas.
- Its entry points.
- How specs and skills reach it.
- Whether attaching project-context docs would naturally need to apply there too.

Stay read-only, give evidence, and be concise.