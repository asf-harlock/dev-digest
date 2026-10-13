## Hand-back 1

Step 9 is done: I added `/Users/harlock/Downloads/Sites/devdigest/e2e/specs/10-onboarding-tour.flow.json`. Number 10 was free. `cd e2e && npm run typecheck` passes and the JSON parses. I did not run `./scripts/e2e.sh` and did not commit.

**Flow steps**
1. `open {BASE}/`, then `wait --url /pulls`. This resolves the seeded repo id from the home redirect, so the id is never hardcoded.
2. `eval window.location.assign(pathname.replace(/\/pulls.*$/, '/onboarding-tour'))`. I chose this over clicking a sidebar item because the sidebar label isn't known yet and `eval` doesn't depend on it.
3. `wait --url /onboarding-tour`, then `wait --text` for each of the five headings: "Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks".
4. `wait --text Skeleton`, then `wait --text "On this page"`.
5. `find first 'a[href^="#"]' click`, then `wait --url "#"`.

It never clicks Generate and never uses `chat`, so nothing triggers a model call.

**What the client must render**
- **Route:** `/repos/:repoId/onboarding-tour` must exist. The flow reaches it by rewriting the pathname of the PR list page `/repos/<id>/pulls`, so the same `/repos/<id>/` prefix is required.
- **Headings:** visible text, exact casing, for the five headings listed above.
- **Status badge:** visible text containing "Skeleton" with a capital S. The badge must show this for the always-degraded seeded repo. Any other text containing "Skeleton" also satisfies the match, since `wait --text` is a substring match.
- **Menu label:** visible text "On this page".
- **Menu items:** at least one real anchor in the DOM matching `a[href^="#"]`, such as `<a href="#architecture">`. It must be reachable without clicking anything else.
- **Hash update:** clicking the anchor must leave a `#` in `location.href`. A native hash anchor does this. If the menu uses buttons that call `history.replaceState` or `pushState`, the selector needs to change, so tell me and I'll adjust.
- **No other hash anchors earlier in the DOM:** `find first` picks the first `a[href^="#"]` on the page. A skip-link before the menu would be clicked instead, and the hash assertion would still pass for the wrong reason.
- **No initial hash:** the page must not add a `#` to the URL on load. A hash present before the click would make the last assertion meaningless.

---

## Hand-back 2

Flow 10 now passes, and the full hermetic `./scripts/e2e.sh` run shows `10/10 flows passed`. I didn't commit.

- **Change:** in `/Users/harlock/Downloads/Sites/devdigest/e2e/specs/10-onboarding-tour.flow.json`, I replaced `wait --text "On this page"` with `wait 'nav[aria-label="On this page"]'`. This waits on the nav element by selector, so it no longer depends on CSS casing. The `find first 'a[href^="#"]' click` and the `wait --url "#"` hash assertion are unchanged.
- **Typecheck:** `cd e2e && npm run typecheck` passes.
- **Flow summary:**
  - `PASS  Onboarding tour renders its deterministic skeleton with the On this page menu`
  - `10/10 flows passed`
  - The other nine flows also show PASS.

The e2e output was noisy with server logs, including a GitHub 404 on "list pull requests". It didn't fail any flow.

The client must keep `aria-label="On this page"` on the `<nav>` element. The flow now depends on that attribute.