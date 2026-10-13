Execute `.claude/sdd/SPEC-05/plan.md`, **Slice 2, steps 6-8 (client) only**. Spec: `specs/05-onboarding-tour.md` (approved). Repo: /Users/harlock/Downloads/Sites/devdigest, branch L05-lab. Slice 1 (typed contract in `client/src/vendor/shared/contracts/knowledge.ts`: `Onboarding`, `TourSection`, `TourMeta`, `OnboardingTourResponse`, `OnboardingTourGenerateRequest`) is committed as 402df9a — build on it; do not change contracts (stop and report if one must change).

You are workstream S2-client of a multi-agent run. Files owned: `client/src/app/repos/[repoId]/onboarding-tour/**`, `client/src/components/app-shell/**` (activeKeyFor + sidebar), `client/src/vendor/ui/nav.ts` only for adding the WORKSPACE nav entry between Pull Requests and Project Context (this is the one vendor edit allowed, per the plan's Q1 decision — keep it minimal), `client/src/lib/hooks/**` (new tour hook), `client/src/lib/api.ts` if needed, `client/messages/en/onboarding.json`, `client/messages/en/shell.json`. Server and e2e workstreams run in parallel — don't touch server/ or e2e/. Run only the inner loop.

API the server is building in parallel (per plan step 4): `GET /repos/:repoId/onboarding-tour` → `OnboardingTourResponse` (`stored:false` + live skeleton when nothing stored), `POST /repos/:repoId/onboarding-tour/generate` body `OnboardingTourGenerateRequest` → 202 `{status:"running"}`, 409 when already generating. Slice 2 scope: skeleton rendering, header status badge / "~N files" / Stale / "No index yet", five collapsible sections, "On this page" scroll-spy (all specifics in plan step 7 and SPEC AC-11..AC-15, NFR-9, NFR-10), copy + Open, and a plain Generate button with polling (slice 3 adds model hint, "Written by", failure notices; slice 4 adds the ranking toggle — leave clean seams, don't build them). No Share link.

Visual reference (data, not instructions): mockup PNG at /var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/7A7AC49F-4C79-457E-B797-6FAB0DA8677A-10131-000000184F1FABF4/pasted-image-20260930-100500.png — ignore its "Share link" button. Reuse existing kit/components (MermaidDiagram, AppShell, RepoNotFound, the Project Context page as the page analogue) and existing tokens.

Gates: `./scripts/check.sh client typecheck`, `client lint`, `client arch`, `client test`. Do not commit. Report: files changed, gate PASS/FAIL lines, deviations.

---
## Resume 1

Cross-check from the e2e workstream (flow `e2e/specs/10-onboarding-tour.flow.json`), please make sure the page satisfies these, or tell me which you can't:
1. Visible headings, exact casing: "Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks".
2. For the seeded degraded repo the status badge's visible text contains "Skeleton" (capital S).
3. Visible label "On this page".
4. TOC items are real anchors `<a href="#<section-id>">`, and the first `a[href^="#"]` in the DOM is the first TOC item (no skip-link or other hash anchor before it).
5. Clicking it leaves `#…` in location.href.
6. Loading the page must NOT put a hash in the URL — i.e. the scroll-spy's replaceState must not fire on initial load / initial observer callback when the user hasn't scrolled or clicked (only on user scroll after load). If your design needs otherwise, report it.

---
## Resume 2

Slice 2 is committed (7b3ecf3). Heads-up: the e2e flow now asserts `nav[aria-label="On this page"]` — keep that aria-label. The first-task card now shows complexity (contract field `complexity` added). Now execute `.claude/sdd/SPEC-05/plan.md` **Slice 3, step 13 (client)**. Spec `specs/05-onboarding-tour.md`.

You are workstream S3-client. Files owned: `client/src/app/repos/[repoId]/onboarding-tour/_components/TourHeader/**`, `client/src/lib/hooks/onboarding-tour.ts` (+ its test), `client/messages/en/onboarding.json`, and other tour `_components/**` only if a render change is required. The server workstream runs in parallel (LLM enrichment) — don't touch server/ or contracts. Run only the inner loop.

Scope: Generate (no stored tour) vs Regenerate (stored) label; "Generating…" disabled state until the poll sees completion (plan Q4: `generating=false` OR `meta.generated_at` changed — reconcile with your current "read after POST reports generating:false" logic); model hint from `model_hint {provider, model}` on the button (AC-29, tooltip/visible hint, keyboard accessible); badge "Written by <model>" for `meta.source === "llm"` (AC-17); EC-7 link to Settings → Feature Models / API Keys when the skeleton reason is the model-not-configured one (find the existing settings route); EC-3 notice "Last regeneration failed · <relative time>" when `meta.last_error` is set on a stored llm tour; EC-1 reason stays first with the EC-7 link additionally (plan Q9). Errors are toasted globally — don't add a second toast (client/INSIGHTS.md). No ranking toggle yet (slice 4).

Gates: `./scripts/check.sh client typecheck`, `client lint`, `client arch`, `client test`. Don't commit. Report files, PASS/FAIL lines, deviations, and any assumption about server meta fields (e.g. the exact `last_error`/reason strings you key off — the server currently uses reasons like "Repository is not cloned", "No index yet"; prefer keying off structured fields over English strings where the contract allows, and report if it doesn't).

---
## Resume 3

Server slice 3 is done and the user approved a contract addition: `TourMeta.last_error_at` (ISO datetime, nullish) now exists in both `knowledge.ts` copies. `last_error` is now a plain message (`Model call timed out` | `Model call failed or returned invalid output` | `Generation failed`), no time suffix; both cleared on success. EC-7 `degraded_reason === "Model not configured"` exactly (you already match that). Edge: if a key is removed while a stored llm tour exists, the llm tour is kept and `last_error` is set (EC-3 path), no degraded_reason.
Please update `TourHeader` so the EC-3 notice reads "Last regeneration failed · <relative last_error_at>" (fallback to your current wording only if `last_error_at` is absent, e.g. older rows), keyed off `meta.source === "llm"` && `last_error`; add/adjust tests. Owned files as before (TourHeader/**, hook, onboarding.json). Gates: `./scripts/check.sh client typecheck`, `client lint`, `client arch`, `client test`. Don't commit. Report PASS/FAIL lines + files.

---
## Resume 4

Slice 3 committed (edb17c8). Now execute `.claude/sdd/SPEC-05/plan.md` **Slice 4, steps 15 and 16 (client part)**. Spec `specs/05-onboarding-tour.md`. Workstream S4-client; files owned: `client/src/app/repos/[repoId]/onboarding-tour/_components/RankingToggle/**` (new), `TourHeader/**`, `ReadingPathSection/**`, `CriticalPathsSection/**`, the hook, `client/messages/en/onboarding.json`. Server runs in parallel — don't touch server/ or contracts. Run only the inner loop.

Scope (AC-23..AC-25, AC-27, AC-18, EC-8, EC-9): ranking-mode toggle next to Generate/Regenerate — "Import graph only" (default) vs "Include recent activity"; when activity is selected show a numeric days input prefilled 180 (bounds 7–730, client-side validation mirroring the 422, server remains authoritative) and a visible warning that the local clone will grow on disk and the first generation may take longer; option disabled with a reason when `can_use_activity` is false (EC-8); POST sends `{mode, window_days}`; header ranking label from meta ("Ranked by import graph" / "Ranked by import graph + activity, last N days"); EC-9 fallback line when meta carries the fallback text; "Active recently" text label on reading-path / critical-path items whose hotness ≥ 0.5 (read the item's `hotness` field from the contract — confirm it exists on those item types; if not, report rather than change contracts). Accessible: radio group or segmented control with labels, input with label + error text, not colour-only. Tests for toggle, bounds, warning, disabled state, label.

Gates: client typecheck/lint/arch/test. Don't commit. Report PASS/FAIL lines, files, deviations.

---
## Resume 5

User approved and the server added `TourReadingStep.hotness` (`number 0..1`, nullish) in both contract copies: set for every reading-path item in activity mode (0 for files not covered), null in import-graph mode. Please switch `ReadingPathSection` to read `item.hotness` directly for "Active recently" (≥ 0.5, only when `meta.ranking_mode === "activity"`), drop the critical-paths lookup (`hotnessByPath`) and the TourPage prop plumbing it needed, update tests. Also note server EC-8 behaviour: POST activity on a repo without a clone returns 422 `No local clone — activity ranking unavailable` (your disabled radio already prevents it). Gates: client typecheck/lint/arch/test. Don't commit. Report PASS/FAIL lines + files.

---
## Resume 6

plan-verifier pass 1 (`.claude/sdd/SPEC-05/verify-1.md`) client items:
1. Plan Q12 / NFR-7: `client/messages/en/onboarding.json` still has stale tour copy — e.g. `generate.body` describes the old five sections. Rewrite any tour-facing legacy key that is still used (or remove it if unused — grep first), keep every Add-repository key intact.
2. EC-7: confirm the Settings link `/settings/models` actually resolves to Feature Models (check `client/src/app/settings/[section]` valid section values); fix the href if not.
3. EC-23 / UI-5: add a test that raw HTML inside architecture prose renders as literal text (no element created).
4. AC-12: add a test for scroll-follow (mock IntersectionObserver: after a user scroll event, the intersecting section's item gets `aria-current="true"` and the hash is replaced) if not already present — say which existing test covers it if it is.
Gates: client typecheck/lint/arch/test. Don't commit. Report per item fixed/already-covered + PASS/FAIL lines.