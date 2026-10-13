## Hand-back 1

## Spec intake: Export to CI (L07, worktree B)

### Framing
Власник агента (Security Reviewer тощо) хоче розгорнути готового агента в GitHub Actions свого репозиторію без ручної роботи. Wizard із 4 кроків генерує файли, відкриває PR із гілки `devdigest/ci`, а потім студія показує, що в CI відбувається: вкладка CI агента та сторінка CI Runs. "Готово" означає: PR відкрито, після мержу workflow запускає бандл `agent-runner`, а результат (repo, PR, агент, verdict, знахідки, вартість, тривалість, лінк на job) з'являється в CI Runs і в історії вкладки CI.
Можливість частково вже є: runner `agent-runner/` (останній коміт), контракти `CiExportInput`/`CiResultArtifact`, таблиці `ci_installations`/`ci_runs`, методи `GitHubClient.commitFiles/openPullRequest/findOpenPr`. Бракує модуля `server/src/modules/ci/` (перевірено Glob — файлів немає), роутів, клієнтських хуків і сторінок.

### Placement
Module(s): server + client (+ мінімально `agent-runner/`, можливо `@devdigest/shared` в обох копіях) → міжмодульна фіча, файл `specs/11-export-to-ci.md`, SPEC-11 · Supersedes: —
Примітки: найвищий існуючий номер — `specs/10-eval-case-editor-run.md` (є ще ненумерований `specs/eval-pipeline.md`). Інші worktree (мультипрогони, PR-стрічка) можуть взяти той самий номер — перевірю перед записом. `agent-runner` відсутній у таблиці модулів кореневого `CLAUDE.md`, тому фіча все одно кладеться в кореневий `specs/`.

### Insights read
Прочитано `server/INSIGHTS.md`, `client/INSIGHTS.md`, кореневий `INSIGHTS.md` (фіча зачіпає ≥2 модулі і `@devdigest/shared`), `agent-runner/insights/INSIGHTS.md`. Релевантні записи: tab key у двох місцях (client), `eval_runs` owner-filter як прецедент "кожен reader має фільтр", вендор-правки потребують явного дозволу користувача (root 2026-09-30), `.nullish()`/`.optional()` для нових полів у client-копії контракту, `drizzle-kit generate` не любить add+drop в одному проході (server). `e2e/` і `reviewer-core/` не читав — не зачіпаються.

### Sources read
| Source | What I took from it |
|---|---|
| Запит користувача | 4 кроки wizard; GHA як основна ціль; Preview-файли; тригери; post-as; PR із гілки `devdigest/ci` або zip; CI Runs; вкладка CI; ingest у `agent_runs` source='ci' через перевірений канал; межі worktree B |
| Дизайн 1 (Target) | 4 картки; GHA "recommended"; пункт "Global" у сайдбарі з CI Runs, Memory, Multi-Agent Review, Agent Performance |
| Дизайн 2 (вкладка CI) | "CI deployment · Active in 2 repos"; кнопки "Update CI config" / "Add to CI"; рядки інсталяцій (repo · GitHub Actions · pill succeeded · "4m ago"); пунктирний "+ Add repository"; вкладка "Stats" теж є в дизайні (у коді її немає) |
| Дизайн 3 (Target + CI tab ззаду) | сегментований "Fail CI on": видно "…itical / Warning + / Never"; лівий сегмент закритий модалкою |
| Дизайн 4 (Preview) | 5 файлів: `agents/security-reviewer.yaml`, 2 skills, `memory.jsonl`, `.github/workflows/devdigest-review.yml` ("editable" лише на workflow); YAML: `types: [opened, synchronize, reopened]`, `node-version: 20`, `run: node .devdigest/runner.mjs review --agent secu…`; runner-файла в списку немає |
| Дизайн 5 (Configure) | чіпи `pull_request:opened`/`synchronize` увімкнені, `reopened` вимкнений; радіо GitHub review (recommended) / PR comment / None (exit code only); інфобокс "set Fail CI on… required status check… No GitHub App needed" |
| Дизайн 6 (Install) | "Open a PR with these files" (recommended; PR "Add DevDigest CI review" із "5 generated files") vs "Copy files as a zip — add them manually"; кнопка Install |
| `agent-runner/` (CLAUDE.md, README, INSIGHTS, `src/*`) | контракт runner-а: команда, env, вихід `devdigest-result.json`, коди виходу, hard-fail без артефакту, рівно один manifest, вимога "workflow не планує job для fork PR" (`context.ts:30-31`) |
| `server/src/vendor/shared/contracts/eval-ci.ts`, `db/schema/ci.ts`, `runs.ts` | поточні контракти й схема (деталі нижче) |
| `client/messages/en/ci.json`, `shell.json`, `app-shell/helpers.ts`, `vendor/ui/nav.ts`, `AgentEditor/constants.ts` | застарілі i18n-ключі wizard-а; `ci-runs` nav-key і `activeKeyFor` уже є; у `nav.ts` секції GLOBAL немає |
| `server/src/adapters/github/octokit.ts`, `vendor/shared/adapters.ts` | `commitFiles` (гілка створюється або оновлюється force-ref), `findOpenPr`, `openPullRequest`; методів для workflow runs/artifacts немає |

### Constraints
- `AgentManifest` не має `post_as`; `post_as` приходить з env `DEVDIGEST_POST_AS` (`agent-runner/src/index.ts:25-33`), а runner нічого не POST-ить, а лише пише файл (`run.ts:149`).
- Runner вимагає рівно один `.devdigest/agents/*.yaml` (`agent-runner/src/manifest.ts:36-44`) і не приймає аргументів (`index.ts:30-50`).
- На hard-fail runner не пише артефакт і виходить 1 (`run.ts:167-172`); на gate-trigger теж виходить 1 (`run.ts:160`).
- `agent-runner/dist/` у `.gitignore` (`agent-runner/.gitignore:2`); у цьому worktree `dist/` і `node_modules/` відсутні (Glob).
- Контракт сам каже, що артефакт "ingested back on refresh" (`eval-ci.ts:454, 470-473`), тобто задум — pull, не push.
- Додатку без автентифікації: `LocalNoAuthProvider`; CORS дозволяє лише `config.webOrigin` (`server/src/app.ts:100`). GitHub-токен — через `container.secrets` (`container.ts:171`).
- Копії `@devdigest/shared` розійшлися: у client-копії немає `AgentManifest` (grep 0 збігів); `CiExportInput` там на рядку 390 проти 419 на сервері. Нове поле з `.default()` у server-копії → `.optional()` у client (root INSIGHTS 2026-09-29).
- Edits у `*/src/vendor/**` — лише за явним запитом користувача; релей від агента не рахується (root `CLAUDE.md` "Do not touch"; root INSIGHTS 2026-09-30).
- Модуль реєструється статично в `server/src/modules/index.ts`; шари `routes → service → repository`; жодного SQL/HTTP у service (`server/CLAUDE.md`).
- Нова вкладка редактора агента — ключ у двох місцях: `AgentEditor/constants.ts` і `VALID_TABS` у `app/agents/[id]/page.tsx` (client INSIGHTS 2026-09-29).
- Тексти UI лише через next-intl; `fetch` у компонентах заборонений (`client/CLAUDE.md`).

### Findings
| ID | Pri | Lens | Finding | Evidence | Proposal |
|---|---|---|---|---|---|
| F1 | high | Cross-module / Untrusted | **Канал ingest.** Push-endpoint недосяжний із GitHub Actions: API локальний (`localhost:3001`) і без auth, CORS лише для web-origin. Вимога "автентифікований endpoint" вимагала б окремого токена + публічного URL. Контракт уже описує pull ("ingested back on refresh"). pull-ingest через GitHub API: сервер із наявним PAT читає workflow runs/artifacts встановленого workflow. Підроблений артефакт теж можливий (PR із того ж репо виконує свою версію workflow — pending R4), тому дані з CI мітяться як "reported by CI" і Zod-валідуються. | `eval-ci.ts:454,470-473`; `app.ts:100`; `container.ts:171`; `server/INSIGHTS.md` (немає auth); pending R4 | Pull-ingest: нового вхідного endpoint немає; `POST /ci/refresh` (або за repo/installation) тягне нові runs; ідемпотентно по `github_run_id`+attempt; канал = автентифікований HTTPS GitHub API. Спека фіксує, що саме перевірено (репо з installation, шлях workflow, `head_sha`) і що ні. |
| F2 | high | Missing state | **Джерело run-ів = список workflow runs, а не лише артефакт.** Hard-fail (немає ключа, LLM-помилка, невалідний manifest) не лишає артефакта; gate-trigger завершує job з кодом 1, і наступні кроки без `if: always()` не виконаються. Дизайн показує pill "succeeded"/"failed" — "failed" без артефакта був би невидимий. | `run.ts:160,167-172`; README "Exit codes"; дизайн 2 (pills) | Рядок CI Runs створюється з run-а workflow (conclusion, `html_url`, `run_started_at`, PR); артефакт лише доповнює (findings, cost, duration). Run без артефакта: status `failed`, findings/cost "—". У workflow upload-artifact із `if: always()`. |
| F3 | high | Corner case | **Один агент на репо.** Runner падає, якщо в `.devdigest/agents/` не рівно один YAML; назва workflow-файла фіксована (`devdigest-review.yml`). Другий агент в тому ж репо зламає обидва. Дизайн-YAML має `--agent <slug>`, а runner аргументів не бере. | `manifest.ts:36-44`; `index.ts:30-50`; дизайн 4 (`review --agent secu…`) | Див. Approaches D2 і Q1. Мінімум: server блокує другу інсталяцію агента в репо, де вже є інший (`409`), "Update" — заміна. |
| F4 | high | Cross-module | **Прогалини контрактів і схеми для вимог UI.** Артефакт не має verdict/blockers/repo/run id/url/версії workflow; `agent` = ім'я з manifest (не id; ім'я можна змінити). `ci_installations` не має workflow_version/post_as/triggers/status/pr_url/agent_version; `ci_runs` — github_run_id, verdict, duration_ms, workspace_id, посилання на `agent_runs`. `CiRun.duration_s` vs `duration_ms` в артефакті; client-копія без `AgentManifest`. Verdict можна вивести детерміновано з conclusion + counts (без зміни runner-а). | `artifact.ts:34-44`; `eval-ci.ts:434-468,474-485`; `db/schema/ci.ts:4-26`; grep client | Міграція (`drizzle-kit generate` у двох проходах add/drop, server INSIGHTS 2026-10-11) + нові поля в обох копіях контракту; verdict/status виводить сервер. `workspace_id` береться через join `installation → agent` (прецедент: child-таблиці без `workspace_id`, server INSIGHTS 2026-09-17). Потрібен явний дозвіл на vendor-edit (Q3). |
| F5 | high | Cross-module | **Рядок `agent_runs` source='ci' потрапить у readers, що source не фільтрують.** PR-список сумує вартість `status='done'` по `pr_id`; Timeline читає run-и по `pr_id`; skills-статистика рахує run-и по `agentId`; boot-reaper перекладає в failed КОЖЕН `running`. Користувач прямо виключив PR-стрічку зі скоупу. | `pulls/routes.ts:200-202`; `reviews/repository/run.repo.ts:79-84,165-168`; `skills/repository.ts:270-275`; `runs.ts:28`; pending R3 | Ingest пише лише завершені рядки: status зі словника local (`done`/`failed`), `pr_id = NULL`, source='ci', звʼязок `ci_runs.agent_run_id`. Спека явно перелічує, які агрегати CI-run-и включають (Q2/Q5). Тести: снапшот readers до/після ingest (за прикладом `eval-case-run.it.test.ts`). |
| F6 | high | Cross-module | **Доставка бандла runner-а.** `dist/` не комітиться й не зібраний; сервер має прочитати файл із сусіднього пакета під час export або повернути зрозумілу помилку. Дизайн-список із 5 файлів і текст "5 generated files" не містять runner-файла; шлях у дизайні (`.devdigest/runner.mjs review --agent`) ≠ реальний (`node .devdigest/runner/index.js`). Бандл — мегабайти тексту; `commitFiles` кладе вміст inline з таймаутом 30 с. Чи запускається один `index.js` без `package.json` поруч (ESM/CJS, `import.meta.url` у перевірці direct-run) — не підтверджено (pending R2). | `agent-runner/.gitignore`; Glob dist; дизайн 4, 6; `index.ts:65-68`; `octokit.ts:18,300-310`; pending R2 | Коміт бандла як `.devdigest/runner/index.js`: у Preview показується read-only (`editable:false`) зі sha256 і розміром; лічильник "N generated files" рахує реальні файли. Немає бандла → export `409`/`503` "runner bundle not built". `uses: devdigest/review-action@v1` лишається коментарем-плейсхолдером. |
| F7 | high | Untrusted / Missing state | **Безпека workflow і секрет.** Workflow має: `permissions: contents: read, pull-requests: write`; guard від fork PR (runner очікує, що workflow сам не плануватиме job для fork-ів); без `pull_request_target`; без вставки `${{ github.event.* }}` у `run:`; `if: always()` на upload. Потрібен секрет `OPENROUTER_API_KEY` у репо — wizard його не ставить, а дизайн мовчить; без нього перший run hard-fail. Старий i18n вже має `secretNote`. | `context.ts:30-31`; `index.ts:35-39`; `ci.json:75,93`; дизайн 4-6 | Генератор завжди видає ці рядки; Install-крок і вкладка CI показують назву секрета й лінк на налаштування репо; значення ключа ніколи не потрапляє ні в файли, ні в preview, ні в лог. |
| F8 | high | Missing state / Config | **Вибір репозиторію, base і права токена.** У wizard-і немає кроку вибору репо (є лише неявний `acme/payments-api`; старий i18n мав ручне поле `owner/name`), а "+ Add repository" у вкладці CI не описаний. `base` у контракті за замовчуванням `'main'`, а репо має `default_branch`. Запис у `.github/workflows/` потребує додаткових прав PAT (unverified — R4). Немає токена → `ConfigError`. | дизайн 2, 6; `ci.json:57-59`; `eval-ci.ts:427`; `app-shell/helpers.ts:7-13`; `container.ts:171-172`; pending R4 | Репо вибирається з підключених (`repos`); "Add repository" = той самий wizard для іншого підключеного репо; base = `default_branch`; помилки (нема токена / 403/404 на workflows) мапляться в окремі повідомлення з діями. |
| F9 | high | Missing state / Idempotency | **Життєвий цикл інсталяції.** "Active in 2 repos" і pill "succeeded" означають, що є стани: PR відкрито / активна / zip вручну / застаріла. `commitFiles` повторно використовує гілку `devdigest/ci` і force-оновлює ref; після мержу/видалення гілки або подвійного кліку Install легко отримати два PR чи PR поверх старої гілки. Зміна `ci_fail_on` піднімає версію агента (виглядає так, `agents/helpers.ts:124`, не перевірено до кінця), але manifest у репо лишається старим до "Update CI config". | `octokit.ts:287-335,343-359`; `agents/helpers.ts:124`; дизайн 2 | `ci_installations.status` (`pending_pr` → `active` після мержу PR або першого run-а; `manual` для zip); зберігати `pr_url`, `workflow_version`, `agent_version` експорту; badge "out of date", якщо агент новіший; Install ідемпотентний (`findOpenPr` + disable кнопки + `409` на паралельний export); "Update CI config" перегенеровує файли в ту саму гілку та попереджає про перезапис ручних правок workflow. |
| F10 | high | Untrusted / Security | **Що і куди записується.** Клієнт повертає відредаговані файли — сервер не має довіряти шляхам: allow-list (`.devdigest/…`, один workflow-файл), без `..`/абсолютних шляхів. Slug-и агента/скілів стають іменами файлів і текстом у YAML/CLI (`--agent <slug>`); ім'я/prompt агента та тіла скілів експортуються в чужий (можливо публічний) репо. `memory.jsonl` у дизайні, але runner пам'ять не читає (grep 0), а таблиця `memory` має scope global/team (модуль memory у `modules/index.ts` не зареєстрований). Незавершений `skill.enabled=false` (injection-flagged) не експортується. | `agent-runner/src/skills.ts:18`; `server/INSIGHTS.md` (clone path, `readFile` без containment); `db/schema/knowledge.ts:8-23`; дизайн 4 | Allow-list шляхів і сувора санітизація slug-ів (збіги slug → суфікс); експортуються лише ввімкнені, не injection-flagged скіли; Preview явно показує, що піде в репо; `memory.jsonl` = лише `scope='repo'` записи цього репо (може бути порожній), Q4. |
| F11 | med | UX | **Fail CI on**: у дизайні видно 3 сегменти ("…itical", "Warning +", "Never"), а enum має 4 (`never/critical/warning/any`), ConfigTab їх усі показує. Те саме поле редагується у двох місцях. | `knowledge.ts:659`; `ConfigTab/constants.ts:16`; дизайн 3 | Вкладка CI і Config використовують одну мутацію `PATCH /agents/:id` та інвалідацію; набір сегментів — Q6. |
| F12 | med | Config | **Тригери**: дизайн — `reopened` вимкнено за замовчуванням, а `CiExportInput` включає його; контракт приймає довільні рядки (потрапляють у YAML). | дизайн 5; `eval-ci.ts:426` | Enum `opened|synchronize|reopened`; за замовчуванням `opened`+`synchronize`; мінімум один обраний (інакше Continue disabled). |
| F13 | med | Scope | **Цілі**: CircleCI/Jenkins/CLI-генераторів немає; користувач просить показувати їх лише за наявності генераторів. | Glob `modules/ci` пустий; дизайн 1 | Q5: показувати лише GitHub Actions; non-gha → `422`. |
| F14 | med | UX | **Zip**: дизайн каже "Copy files as a zip / add them manually", користувач — "завантажити zip". На клієнті немає zip-залежності; на сервері є `fflate` (використовується для unzip у `skills/helpers.ts:1`). | `server/package.json:33`; grep client | Сервер віддає zip (`application/zip`, `Content-Disposition`), клієнт запускає завантаження; installation `status='manual'`. |
| F15 | med | Missing states | **Сторінка CI Runs**: маршруту `/ci-runs` немає; в `ci.json` старий набір колонок (timestamp, PR, source, findings, cost, status) без repo/agent/verdict/duration/job. Потрібні: empty (ключ `emptyTitle` вже є), loading, error, "—" для невідомої вартості/тривалості vs `$0.00`, verdict для failed без артефакта, довгі repo/PR. Лінк на job береться з GitHub API (`html_url`), перевіряється на `https://github.com/…`, `rel="noopener noreferrer"`. | `ci.json:1-31`; `app-shell/helpers.ts:40`; `runs.ts:22-24` | Таблиця з колонками з вимог; фільтри з ключів `ci.json`. |
| F16 | med | Concurrency | **Refresh**: пулінг GitHub повільний і має rate limit; два одночасних refresh → дублі; немає токена/`401`/rate limit → що бачить користувач; fire-and-forget без прогресу — прогалина з client INSIGHTS. | client INSIGHTS 2026-09-24; pending R4 | Unique `(installation, github_run_id, attempt)`; per-installation single-flight (`409`); клієнт відстежує refresh до результату, є timeout і глобальний toast. |
| F17 | med | UX / Inherited debt | **Вкладка CI**: ключ у двох місцях; дизайн показує ще вкладку "Stats" (її немає — не додаємо); історія: скільки рядків і яка пагінація не задано (default 50 останніх на інсталяцію). | `AgentEditor/constants.ts:12-17`; client INSIGHTS 2026-09-29; дизайн 2 | Додати лише CI; Stats — non-goal. |
| F18 | med | Cross-module | **`post_as`**: runner читає лише env `DEVDIGEST_POST_AS`, а manifest поля не має; runner понижує APPROVE → COMMENT (Actions-токен не може approve-ити). | `index.ts:25-33`; `github.ts:70`; runner INSIGHTS Open Questions | Генератор ставить `DEVDIGEST_POST_AS` в env workflow (без зміни контракту manifest); підказка в Configure, що "GitHub review" не робить formal approve; інфобокс називає точне ім'я required check (ім'я job-а). |
| F19 | med | Inherited debt | **Застарілі i18n**: `ci.json` має "Publish to CI", "Block merge requires a GitHub App", що суперечить новому дизайну ("No GitHub App needed"). Клієнтського коду, що їх використовує, немає (grep). | `ci.json:70-71,77-102`; дизайн 5 | Переписати namespace `ci` під нове формулювання; старі ключі видалити. |
| F20 | low | Placement | `agent-runner` немає в таблиці модулів `CLAUDE.md`, у `engineering-insights`/routing; має і `package-lock.json`, і `pnpm-lock.yaml`. Не вирішується цією спекою — лише згадка. | Glob `agent-runner/*`; root INSIGHTS 2026-09-29 (прецедент `mcp/`) | Non-goal; follow-up. |
| F21 | low | Process | SPEC-11 може зіткнутися з номером з іншого worktree. | `specs/` (макс. 10) | Перевірити перед записом. |
| F22 | low | Tests | e2e-флоу для CI немає (`e2e/specs/03-agents.flow.json` покриває лише список агентів). | `e2e/specs/` | Один флоу: вкладка CI → wizard до кроку Install (без реального GitHub). |

Фіча на межі розміру: 10 high. Якщо хочете два spec-и — розділити на (a) export (wizard, генератор, PR/zip, вкладка CI) та (b) ingest + CI Runs + історія. Дефолт: один spec, бо (b) залежить від (a) контрактами.

### Approaches
| Option | What | Touches | Size | Risk |
|---|---|---|---|---|
| **D1-A (pull)** | Студія за `Refresh` тягне workflow runs і артефакти через GitHub API (PAT вже в secrets); нового вхідного endpoint немає | `ci/` service + нові методи `GitHubClient` + `mocks.ts`; `fflate` для розпаковки | M | Токен потребує `Actions: read`; rate limit; артефакти живуть обмежений час (R4) |
| D1-B (push) | Workflow POST-ить результат на endpoint із токеном | вхідний route + токен у secrets репо + публічний URL | M | Недосяжно для localhost; без публічного URL не працює |
| D1-C (гібрид) | A + опційний push, коли задано публічний URL | A + B | L | Два шляхи → дублі й більше поверхні атаки |
| **D2-A (1 агент/репо)** | Server блокує другу інсталяцію; runner без змін | `ci/` | S | Другий агент у репо неможливий |
| D2-B (вибір агента) | Runner читає `DEVDIGEST_AGENT` (slug) і вибирає `agents/<slug>.yaml`; workflow-файл на агента | `agent-runner/src/manifest.ts`, `index.ts` + генератор | M | Правка пакета, який змінював інший worktree; один workflow на агента |
| D2-C (цикл) | Один workflow запускає runner по кожному manifest | зміни runner-а | L | Складний exit-код/artifact на кілька агентів |
| **D3-A (комітити бандл)** | `.devdigest/runner/index.js` у PR | `ci/` читає `agent-runner/dist` | S | Розмір PR; потрібна збірка (`pnpm build`) |
| D3-B (action) | `uses: devdigest/review-action@v1` | — | — | Опублікованого action немає — відхилено користувачем |
| D3-C (завантаження в CI) | Workflow качає бандл за URL | зовнішній хостинг | M | Немає де хостити; supply-chain |
| **D4-A (`ci_runs` + `agent_runs`)** | `ci_runs` — CI-факти (repo, PR, run id, verdict, job url), `agent_runs` source='ci' — спільні метрики; `ci_runs.agent_run_id` | схема + ingest | M | Читачі `agent_runs` (F5) |
| D4-B (лише `ci_runs`) | Без запису в `agent_runs` | схема | S | Суперечить вимозі користувача про `agent_runs` |

Recommendation: D1-A, D2-A (D2-B, якщо вам дозволено правити `agent-runner/` і ви хочете кілька агентів на репо), D3-A, D4-A. Вибір D1-B/C — лише якщо API має публічну адресу.

### Research requests (for the caller — run one `researcher` per row, in parallel)
| ID | Question | Scope | Where to look | Unblocks |
|---|---|---|---|---|
| R1 | Чи існувала раніше реалізація Export-to-CI/ingest у git-історії (модуль `server/src/modules/ci/`, `export-ci`, `ci_runs` refresh, шаблон workflow) і що саме вона робила (канал ingest, імена файлів, шлях runner-а, версіонування workflow)? | repo | `git log -S 'export-ci' --oneline --all`; `git log -S 'ci_runs' --all`; `git show upstream/full-functionality:server/src/modules/ci/` (root INSIGHTS: prior implementations живуть у `upstream/full-functionality`) | F1, F2, F6, Q2 |
| R2 | Чи можна зібрати `agent-runner` (`pnpm install && pnpm build`) і запустити одинокий `dist/index.js`, скопійований у порожній каталог без `package.json` (`node <dir>/index.js`, Node 20 і 22): це ESM чи CJS, чи працює `import.meta.url`-перевірка direct-run, який розмір у байтах, чи створює ncc `dist/package.json`? | repo (Bash) | `agent-runner/package.json`, `agent-runner/src/index.ts:65-68`, результат `ncc build` у scratch-копії | F6, NFR розміру, D3-A |
| R3 | Які читачі `agent_runs` (server + client: `pulls/routes.ts`, `reviews/repository/run.repo.ts`, `skills/repository.ts`, `eval/repository.ts`, `agent-performance`, agent stats, MCP) змінять число або впадуть на рядку `source='ci'`, `status='done'`, `pr_id NULL`, без `reviews`/`run_traces`/`findings`? Список reader → ефект. | repo | `grep -rn "agentRuns\|agent_runs\|RunSummary" server/src client/src mcp/src` | F5, D4-A, Q2 |
| R4 | Які точні дозволи fine-grained PAT потрібні для (a) коміту файлу під `.github/workflows/` через Git Data API і відкриття PR, (b) `GET /repos/{o}/{r}/actions/workflows/{id}/runs`, list artifacts і завантаження zip; яка стандартна retention артефактів; чи PR-гілка в тому ж репо виконує свою змінену версію workflow (підробка артефакта) і який рекомендований спосіб верифікації (path/head_sha/attestation)? | external | docs.github.com: REST "Actions", "Permissions required for fine-grained PATs", artifacts retention, `pull_request` security | F1, F8, F16, UI-n про підробку |

### Questions for the user
Blocking (spec не можна писати без цього):
- **Q1** Скільки агентів може бути в одному репо? Runner зараз падає, якщо manifest не один (`manifest.ts:36-44`). Варіанти: один агент на репо (D2-A) чи вибір агента через env/аргумент (D2-B, правка `agent-runner/`). — my default: D2-A.
- **Q2** Канал ingest: pull через GitHub API з PAT (D1-A), push на endpoint (D1-B) чи гібрид? Дозволений "інший перевірений канал" з вашого запиту — це саме pull. І чи пишемо `agent_runs` з `pr_id = NULL`, щоб не зачепити PR-стрічку (F5)? — my default: D1-A + `pr_id NULL`, агрегати агента (runs/avg cost) CI не враховують, поки не вирішено інакше.
- **Q3** Дозвіл на вихід за межі `ci/`: (a) правка обох vendor-копій `@devdigest/shared` (потрібен явний дозвіл за `CLAUDE.md`), (b) нова міграція, (c) `client/src/vendor/ui/nav.ts` (додати секцію GLOBAL з CI Runs; є прецедент у client INSIGHTS 2026-09-20), (d) мінімальні правки `agent-runner/` (лише якщо Q1=D2-B). — my default: так на (a), (b), (c); (d) лише разом з D2-B.

Non-blocking (підуть у `Open questions`, якщо не відповісте):
- **Q4** Вміст `memory.jsonl`: — my default: лише `scope='repo'` записи цього репо, може бути порожнім; runner його не читає (non-goal); Preview показує вміст до експорту.
- **Q5** Цілі CircleCI/Jenkins/CLI: — my default: показувати лише GitHub Actions, інші не відображаються, `422` для non-gha.
- **Q6** Сегменти "Fail CI on": — my default: всі 4 значення enum (`Never / Critical / Warning + / Any`); лівий сегмент у дизайні закритий модалкою, тож це припущення.
- **Q7** Тригер за замовчуванням: — my default: `opened` + `synchronize`, `reopened` вимкнено (дизайн), мінімум один обраний.
- **Q8** Момент ingest і глибина історії: — my default: кнопка Refresh + автоматичний refresh при відкритті сторінки, якщо дані старші 60 с; історія — останні 50 run-ів на інсталяцію.

Reply with answers, or "accept defaults", or per-finding keep/drop (F1 keep, F13 drop).

### Self-check (Phase 1)
Self-check: all 9 items pass (файли не створювалися; `Insights read` вказує лише торкнуті модулі + корінь як міжмодульний; одна таблиця findings, `high` зверху, рівно 10 high, усі `pending` помічені R1–R4; 4 research-запити незалежні; `Supersedes: —`; 3 blocking питання з дефолтами; не перевірене (`agents/helpers.ts:124` ефект на версію, дозволи PAT, ESM/CJS бандла) позначено як unverified/pending).

---

## Hand-back 2

## Spec SPEC-11 написано (Phase 2)

**Файл:** `~/emdash/worktrees/devdigest-2b9b9360/l07-lab-export-to-ci/specs/11-export-to-ci.md`
**Spec ID:** SPEC-11 · **Status:** draft · **Supersedes:** — (номер перевірено: найвищий існуючий `specs/10-eval-case-editor-run.md`, колізій немає).

### Кількість
US 6 · AC 65 · EC 37 · NFR 16 · UI 13 · Open questions 14.

### Як застосовано відповіді користувача
- **Q1 (D2-A):** AC-32/33/34 (один агент на репо, `409 ci_repo_taken`, Update замінює), NFR-2 (унікальний constraint). Runner не змінюється; у Non-goals відхилено вибір агента через env/аргумент і цикл по manifest-ах.
- **Q2 (D1-A):** pull через GitHub API (AC-52–AC-63), вхідного endpoint немає (відхилено в Non-goals). `agent_runs`: `source='ci'`, `pr_id` NULL, лише завершені рядки зі словником `done`/`failed` (AC-60). Рядки CI `running` живуть лише в `ci_runs` (AC-56), бо boot-reaper перекладає будь-який `agent_runs.status='running'` у failed (researcher R3).
- **Q3:** дозволено vendor-контракти в обох копіях (NFR-4), міграцію (NFR-3, EC-34), `nav.ts` GLOBAL із CI Runs (AC-45). Правки `agent-runner/` не дозволені, тому verdict/blockers/run-link виводяться на сервері (AC-47), а доставку артефакта забезпечує sidecar `devdigest-run.json`, який пише згенерований workflow (AC-25).
- **Q4–Q8 (дефолти):** `memory.jsonl` лише `scope='repo'` (AC-30, EC-16/17); Target показує лише GHA, `422 unsupported_target` (AC-3, EC-4); Fail CI on має 4 сегменти (AC-41); тригери opened+synchronize за замовчуванням, мінімум один (AC-7, EC-6); Refresh + авто-refresh при відкритті, якщо >60 с, debounce 30 с, історія 50 (AC-52–54, AC-40).

### Як використано research
R1 (prior art `upstream/full-functionality`): перевірки довіри до артефакта (EC-19..21, UI-8), структурований YAML (NFR-6), fork guard, мінімальні permissions і sidecar (AC-21..26), pin за SHA (NFR-7), копіювання всього `agent-runner/dist` (AC-31, EC-3), статуси і причини збою (EC-22, AC-59). R2: runnability бандла не підтверджена, тому це Q-2, а не вимога. R3: `countRunsByAgents` рахує CI-рядки (AC-64 + Q-4), PR-рідери з `pr_id` NULL не зачеплені (AC-65, NFR-16). R4: права токена (EC-2, EC-25), 410 для протермінованих артефактів (EC-23), підробка артефакта (UI-10, Q-8), Actions-токен не може approve.

### Зміни проти intake
- Бандл тепер **кілька файлів** (`index.js` + chunk + `package.json`), а не один: F6 переписано за R1 (лічильник файлів у Preview = реальна кількість, runner-файли read-only, вміст завантажується на вимогу, AC-6).
- Додано новий edge case EC-7 (не було в intake): runner завжди створює `OpenRouterProvider` (`agent-runner/src/index.ts:39`), тому для агента з provider ≠ openrouter Preview показує попередження, але не блокує.
- Верифікація origin артефакта: sidecar (commit SHA, repo, PR number) звіряється з run-ом (EC-21); автентичність вмісту — non-goal (Q-8).
- F20 (agent-runner відсутній у таблицях модулів) і F21 (колізія номера) у вимоги не потрапили: перший залишено поза скоупом, другий закрито перевіркою номера. F22 (e2e) став Q-10.

### Open questions, що лишилися (всі з default і owner)
Q-1 Node-версія в workflow (дефолт 22, дизайн показує 20) · Q-2 перевірка standalone-запуску скопійованого runner-а (R2 не змогла виконати) · Q-3 лінк на workflow run, а не job · Q-4 one-line фільтр у `skills/repository.ts` поза `ci/` · Q-5 на який рядок діє Update CI config · Q-6 підняти timeout `commitFiles` з 30 до 120 с · Q-7 стара гілка `devdigest/ci` · Q-8 attestations (ні) · Q-9 обрані ліміти (500 / 64 KiB / 30 / 50 / 200 / 24 год) · Q-10 e2e-флоу · Q-11 конфлікт GLOBAL-секції nav з іншими worktree · Q-12 verdict від `ci_fail_on` на момент export · Q-13 SHA для actions шукати під час планування · Q-14 PR закрито без merge лишається `pending_pr`.

### Self-check
Self-check: all 12 items pass. Перевірено вручну (скрипт запустити не можу, Bash немає): рівно один `(shall)` у кожному AC/EC/NFR/UI (grep на дублікати чистий), жодного vague-слова в тих секціях, дев'ять `##` заголовків у порядку шаблону, кожен AC має `(US-n)`, кожен US обслуговується AC, кожен Q має `default:` і `owner:`.

Run: node .claude/skills/spec-authoring/scripts/lint-spec.mjs specs/11-export-to-ci.md

Примітка: `Status` лишився `draft`; затвердження за користувачем, далі `implementation-planner`.