Phase 1 (requirements review + clarifying questions). Do NOT write the plan yet.

Repo: ~/emdash/worktrees/devdigest-2b9b9360/l07-lab-export-to-ci (branch l07-lab-export-to-ci, git worktree). Respond in Ukrainian for the questions (the user writes Ukrainian); file paths/code in English.

## Feature
Deploy finished review agents to GitHub Actions ("Export to CI"). The last commit (fe3a37a "add agent-runner") added a new standalone package `agent-runner/` (read its CLAUDE.md, README.md, insights/INSIGHTS.md, src/) — this is the bundled runner the generated workflow must execute. Note it ships both package-lock.json and pnpm-lock.yaml — flag that if it matters. There is currently no `ci` module in server/src/modules; the DB schema reportedly already holds tables for every lesson including ci and agent_runs — verify (server/src/db/schema). Check specs/ (no L07 lesson spec exists in specs/lessons) and existing agent pages in client/ (agents tabs: Config, Skills, Context, Evals, Stats, CI).

## User's requirements (verbatim, Ukrainian — "worktree B")
- кнопка Add to CI відкриває Export Wizard із чотирма кроками: Target → Preview → Configure → Install;
- Target: GitHub Actions як основний сценарій; CircleCI, Jenkins і Generic CLI можна показати як альтернативні цілі лише якщо генератори для них справді реалізовані;
- Preview: manifest, skills, .devdigest/memory.jsonl і редагований .github/workflows/devdigest-review.yml;
- Configure: події pull_request (opened, synchronize, опційно reopened) і спосіб публікації результату — review, PR comment або лише exit code;
- Install: відкрити PR із файлами або завантажити zip;
- wizard створює окрему гілку devdigest/ci й PR, а не пише безпосередньо в main;
- workflow запускає збандлений agent-runner; uses: devdigest/review-action@v1 у макеті залишається плейсхолдером, доки такого опублікованого action немає;
- CI Runs показує репозиторій, PR, агента, verdict, знахідки, вартість, тривалість і посилання на job;
- вкладка CI на сторінці агента показує інсталяції, версію workflow, історію й налаштування Fail CI on;
- worktree B змінює ci/, його роути, CI Runs і вкладку CI агента. Сервіс мультипрогонів і PR-стрічку не чіпає;
- ingest пише запуск у agent_runs із source='ci' і приймає результат лише через автентифікований endpoint або інший перевірений канал.

## Designs (screenshots — open them with Read)
1. ~/Library/Application Support/emdash/acp-attachments/conversations/50d95a7c-e5e7-4d51-aa98-931552b0dbcb/92fc9471-f98f-4662-a6f1-a7eeb495d100/content.png — wizard step 1 Target (GitHub Actions "recommended", CircleCI "config.yml job", Jenkins "Pipeline stage", Generic CLI "devdigest review --pr").
2. .../f04a4254-7182-4044-a835-0dcca7df83a9/content.png — agent CI tab: "CI deployment · Active in 2 repos", buttons "Update CI config" and "Add to CI"; installation rows (repo, GitHub Actions, status succeeded, time ago); dashed "+ Add repository".
3. .../b2290e34-087d-4b9f-8b49-0125bb1dfb09/content.png — Target step again; behind the modal the CI tab shows a "Fail CI on" segmented control (…Critical / Warning + / Never).
4. .../8fbd6bde-81df-4875-a74c-29dff7d15352/content.png — step 2 Preview: "FILES TO CREATE" list (.devdigest/agents/security-reviewer.yaml, .devdigest/skills/secret-leakage-gate.md, .devdigest/skills/lethal-trifecta.md, .devdigest/memory.jsonl, .github/workflows/devdigest-review.yml) + "editable" YAML editor showing `run: node .devdigest/runner.mjs review --agent secu…`.
5. .../c0a0de6a-e3cc-4b89-a55d-b0f42c1ac30c/content.png — step 3 Configure: Trigger chips (pull_request:opened ✓, synchronize ✓, reopened), "Post results as" radio (GitHub review recommended / PR comment / None (exit code only)), info box about Fail CI on + required status check.
6. .../02152970-81a2-460e-8bd1-19f6687bc2b1/content.png — step 4 Install: "Open a PR with these files" (recommended; DevDigest opens a PR in acme/payments-api titled "Add DevDigest CI review" with the 5 generated files) vs "Copy files as a zip — add them manually"; link "GitHub Action setup docs →"; Install button.
(All under ~/Library/Application Support/emdash/acp-attachments/conversations/50d95a7c-e5e7-4d51-aa98-931552b0dbcb/.)

## What I need from you now
Your phase-1 reply: requirements review, gaps/contradictions between requirements, designs and the existing code (e.g. design shows .devdigest/runner.mjs vs bundled agent-runner; how the bundle gets into the PR; how the runner authenticates to ingest — token per installation? secret name?; where the GitHub token for opening the PR comes from — LocalSecretsProvider; which repo the installation targets — the workspace's selected repo vs "Add repository" picker; "Update CI config" semantics; Fail CI on storage & how it reaches the runner; "workflow version"; whether CI Runs page already exists in client nav; zip generation server- vs client-side; whether ingest must be reachable from GitHub given the app is local-first), recommended improvements, and numbered clarifying questions with your recommended default for each. Also note whether a SPEC-NN via spec-creator should exist first per repo conventions — but the user explicitly asked to go straight to planning with you, so treat the requirements above as the spec. Ask about single- vs multi-agent execution mode as your process requires.