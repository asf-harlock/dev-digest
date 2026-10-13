## Hand-back 1

{
  "bucket": "backend",
  "files_reviewed": [
    "server/src/modules/onboarding-tour/repository.ts",
    "server/src/modules/onboarding-tour/service.ts",
    "server/test/onboarding-tour.it.test.ts"
  ],
  "out_of_scope": [],
  "findings": [
    {
      "severity": "SUGGESTION",
      "category": "test",
      "title": "No test for the empty-SHA -> NULL branch or failure-path upserts",
      "file": "server/src/modules/onboarding-tour/repository.ts",
      "start_line": 60,
      "end_line": 60,
      "rationale": "`upsert` now derives `headSha = tour.meta.index_sha || null`. Every service caller goes through it: `storeSkeleton`, `storeFailure`, `recordFailure` and the B1 degraded branch all re-upsert `existing.tour` with only `last_error` changed. The new tests only assert the happy path (`headSha === 'sha1'` after a generate, and a manual column override). Nothing asserts two things that the PR's own behaviour depends on. First, a tour whose `index_sha` is null or empty is stored as SQL NULL, so it is never flagged stale. Second, a failure-path re-upsert of a kept LLM tour leaves `head_sha` unchanged and does not wipe it. A regression in either place would change when 'stale' shows, and the suite would stay green. This is a coverage gap rather than a defect: I traced the code and found no bug (`computeStale` in `helpers.ts:359` already treats null and undefined as not stale).",
      "suggestion": "Add one `.it.test.ts` case that generates a tour with no index SHA and asserts `rows[0]?.headSha` is null. Add another that forces an LLM failure after a stored LLM tour exists, then asserts `head_sha` is still the original SHA. Both can reuse the existing `get`, `settled` and `makeApp` helpers in `server/test/onboarding-tour.it.test.ts`.",
      "confidence": 0.6,
      "psr_skill": "typescript-expert"
    }
  ]
}