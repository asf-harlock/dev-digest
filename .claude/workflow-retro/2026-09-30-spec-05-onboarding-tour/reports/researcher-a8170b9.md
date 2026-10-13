## Hand-back 1

## Repository research: prior onboarding-tour implementation in git history

### Findings
- NO. No commit on any branch (local and remote) ever contained an onboarding-tour server module, route, facts collector, or per-repo client tour page. The only onboarding-related pieces are the ones still on HEAD, and they were all added in the initial squashed snapshot 587c46a. Nothing was removed later, because it was never there.
- `onboarding.system.md`, `OnboardingSection` and `onboarding-tour` appear in history only in 587c46a ("DevDigest — local AI PR-review lab (squashed snapshot)"), the earliest commit. `git log -S` shows no later add or remove for any of them.
- `git log --all -- 'server/src/modules/onboarding/**' 'client/src/app/repos/*/onboarding*/**'` returned nothing. `git log -S 'modules/onboarding'` also returned nothing.
- The prompt `server/src/prompts/onboarding.system.md` (present in 587c46a and on HEAD) is the only trace of the tour generator:
  - It uses the placeholders `{{sections}}` and `{{language}}`.
  - It expects FACTS covering stack, services, sizes, routes and tests, plus a file tree, key-file excerpts and context. Nothing in history implements the collector that would supply these.
  - It allows mermaid diagrams only for sections `architecture` and `routes_and_apis`. Those two are the only section kinds named anywhere. The prompt does not list the rest, because they are injected through `{{sections}}`.
  - It sets `body` as markdown, up to 4 `links` of {label, path}, and a prompt-injection guard using `<untrusted>` blocks.
- The contract `Onboarding`/`OnboardingSection`/`OnboardingLink` lives in `server/src/vendor/shared/contracts/knowledge.ts:28-47` and in the same file under `client/src/vendor/shared/`.
  - `OnboardingSection` is `{kind: z.string(), title, body (markdown), diagram nullish (mermaid), links[]}`.
  - `kind` is a free string, not an enum.
- `repoIntel.getCriticalPaths` and `getTopFilesByRank` are defined in 587c46a:
  - `server/src/modules/repo-intel/service.ts:639` (`getTopFilesByRank`) and `:663` (`getCriticalPaths`).
  - `server/src/modules/repo-intel/types.ts:166` and `:171`.
  - A degraded-mode test in `server/test/repo-intel-facade-degraded.test.ts:90-96`.
- Callers of those two methods were added later:
  - be11a29 "feat(blast): add GET /pulls/:id/blast impact-map route".
  - b77650c "feat(conventions): add local/AI/both extraction modes and agent-linking".
  - Neither is an onboarding caller.
- The client has only a repo-add flow at the `/onboarding` route, not a tour:
  - `client/src/app/onboarding/page.tsx`
  - `client/src/app/onboarding/_components/AddRepoView/{AddRepoView.tsx,index.ts}`
  - `client/messages/en/onboarding.json`
  - `e2e/specs/06-onboarding.flow.json`
- No route path for a tour exists in history. `server/README.md:10` only mentions "brief/context/onboarding" in a list of feature areas that are not yet routed.
- The repo-intel comment at `service.ts:15` says "T3 unlocks `getCriticalPaths` etc."

### Evidence
- `git log -S` results: the onboarding strings match only 587c46a. `getCriticalPaths` and `getTopFilesByRank` match 587c46a, b77650c and be11a29.
- `git ls-tree -r --name-only 587c46a | grep -i onboard` returned six files:
  - `client/messages/en/onboarding.json`
  - `client/src/app/onboarding/_components/AddRepoView/AddRepoView.tsx`
  - `client/src/app/onboarding/_components/AddRepoView/index.ts`
  - `client/src/app/onboarding/page.tsx`
  - `e2e/specs/06-onboarding.flow.json`
  - `server/src/prompts/onboarding.system.md`
- `git show 587c46a:server/src/prompts/onboarding.system.md` contains the text "Prefer the precomputed FACTS (stack, services, sizes, routes, tests)".

### References
- `/Users/harlock/Downloads/Sites/devdigest/server/src/prompts/onboarding.system.md`
- `/Users/harlock/Downloads/Sites/devdigest/server/src/vendor/shared/contracts/knowledge.ts`
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/repo-intel/service.ts`
- `/Users/harlock/Downloads/Sites/devdigest/client/src/app/onboarding/page.tsx`

### Could not find
- Any onboarding server module, route, facts collector (stack/scripts/services/manifests), or per-repo tour client page in any commit. A fresh implementation is needed.
- The tour's full section-kind list. Only `architecture` and `routes_and_apis` are named, in the prompt.
- Possible blind spots: unreachable objects (dangling commits, stashes) and the `backup/L03-homework-pre-squash` branch. I did not check stashes or dangling commits. `--all` covers the backup branch, and it showed no hits.