Repo: /Users/harlock/Downloads/Sites/devdigest. Read-only research.

Question: In the PR review path, does the code pass temperature, top_p or seed to the LLM provider, and with what defaults? How non-deterministic would repeated review runs on the identical input be? Also: what does a single review call cost/how is cost computed (costUsd), and can the reviewer-core `reviewPullRequest(ReviewInput)` be invoked directly with a stored diff fragment + PR title/body without the live repo (what fields of ReviewInput are required vs optional, and what the grounding gate needs)?

Look in: `reviewer-core/src/llm/*`, `reviewer-core/src/review/run.ts`, `reviewer-core/src/grounding.ts`, `server/src/adapters/llm/*`, `StructuredRequest` in `server/src/vendor/shared/adapters.ts`, `server/src/modules/reviews/run-executor.ts` (how it builds ReviewInput and which provider/model settings it uses).

Report with file:line for each claim.