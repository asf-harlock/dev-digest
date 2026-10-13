## Hand-back 1

## Requirements review: Export to CI (SPEC-12)

### Source
`specs/12-export-to-ci.md` (Status: approved). Дефолти Q-1..Q-14 прийняті. Q-13 я закрив нижче. Q-2 піде ранім gate-кроком.

Прочитано: root/server/client/agent-runner `CLAUDE.md`, `server/INSIGHTS.md`, `client/INSIGHTS.md`, `agent-runner/insights/INSIGHTS.md`, `routing.json`, схему `ci.ts`, обидві копії контрактів `eval-ci.ts`, `octokit.ts`, `agents/*`, `skills/repository.ts`, `nav.ts`, `AgentEditor`, а також prior art з `upstream/full-functionality`.

### Requirements as given
Спека чиста: ~90% вимог Clear, перевірні тестом або браузером. Тому нижче згруповано, окремо лише не-Clear.

| # | Вимога | Status | Примітка |
|---|---|---|---|
| AC-1..AC-31, AC-34..AC-46, AC-48..AC-53, AC-55..AC-59, AC-61..AC-65 | візард, генерація файлів, CI-таб, CI Runs, refresh/ingest | Clear | перевірка: unit/it/RTL, окремі пункти потребують браузера |
| AC-28 + AC-34 (+ UI-2) | маніфест `.devdigest/agents/<agent-slug>.yaml`; повторний export оновлює інсталяцію | **Conflicting** | див. Q2 |
| AC-32 | Continue disabled, коли репо зайняте іншим агентом, і назва агента | **Missing detail** | у клієнта немає джерела даних про чужі інсталяції. Див. Q3 |
| AC-47, AC-60 (blockers) | вердикт і blockers з severity counts | Missing detail (non-blocking) | у `CiResultArtifact` `critical/warning/suggestion` є `nullish`. Див. Q7 |
| AC-55, EC-25 | listWorkflowRuns по файлу workflow | Missing detail (non-blocking) | див. Q6 |
| AC-62 vs AC-54 | "skipped" означає і запуски, і інсталяцію (debounce) | Ambiguous (закриваю в контракті, Q3) | `status:'skipped'` на інсталяції, `skipped` як число запусків |
| NFR-10 / EC-31 | refresh ≤ 60 s | Missing detail (non-blocking) | див. Q8 |
| AC-24 | env кроку runner | Clear, але неповне | `agent-runner/src/context.ts` читає `GITHUB_REPOSITORY` і `PR_NUMBER`. Додам обидва через `env:` (UI-7-safe). Рекомендація R3 |
| EC-1 | `409 github_token_missing` | Clear, але `container.github()` зараз кидає `ConfigError` (500) | сервіс перевіряє токен сам |

### Contract coverage
Поточні контракти в обох копіях `eval-ci.ts` (`CiExportInput`, `CiInstallation`, `CiRun`, `CiResultArtifact`) і таблиці `ci_installations`/`ci_runs` покривають малу частину значень, які показують UI і сервер.

| Вимога | Значення | Поле контракту (обидві копії) | Зберігається | Gap |
|---|---|---|---|---|
| AC-15, AC-37, AC-39, AC-43 | status `pending_pr\|manual\|active`, `pr_url`, `workflow_version`, `agent_version`, `post_as`, `triggers`, `ci_fail_on` as exported, `agent_name`, `last_refreshed_at`, `update_available`, `last_run` | `CiInstallation` розширити | `ci_installations`: нові колонки, `workspace_id` (migration) | yes → Q3, Q5 |
| AC-20, UI-3, UI-6 | текст workflow від клієнта, enum triggers, `base` не довіряється (UI-4) | `CiExportInput`: `workflow_yaml?`, `triggers: enum[]`, прибрати `base` | — | yes → Q3 |
| AC-4..AC-6, EC-7, EC-16, EC-17 | список файлів, runner-контент не віддається, warnings (provider≠openrouter, memory empty/truncated), file_count | новий `CiPreview`, `CiPreviewFile` | — | yes → Q3 |
| AC-46..AC-50, UI-9..UI-12 | repo, PR, agent, verdict, findings + counts, cost, duration, run time, job URL, failure reason | `CiRun` переписати | `ci_runs`: `repo`, `agent_name`, `github_run_id`, `run_attempt`, `head_sha`, `pr_number`, `severity counts`, `duration_ms`, `verdict`, `failure_reason`, `job_url`, `agent_run_id`, `workspace_id`, `ingested_at` | yes → Q3, Q5 |
| AC-62, EC-26 | per-installation added/updated/skipped, failure code, reset time | новий `CiRefreshResult`, `CiRefreshInput` | `ci_installations.last_refreshed_at` | yes → Q3 |
| AC-21, AC-25, EC-21 | sidecar `devdigest-run.json` | новий `CiRunMeta` (commit_sha, repository, pr_number) | — | yes → Q3 |
| AC-32, AC-33 | чужа інсталяція для репо | новий `GET /ci/installations` (workspace-wide) | ті самі | yes → Q3 |
| error `details` | `ci_repo_taken`: `{agent_id, agent_name, installation_id}`; `rate_limited`: `{reset_at}`; `github_permission`: `{operation}`; PR-open fail: `{branch}`; no-diff: коди | — | — | yes → Q3 |
| EC-18 | `agent_name` і `repo` на run переживають видалення агента | у `CiRun` | колонки на `ci_runs` | покрито в Q5 |
| NFR-2 | case-insensitive унікальність репо | — | unique index `(workspace_id, lower(repo))` | покрито в Q5 |

### Clarifying questions
Блокуючі:
1. **[NFR-6, EC-11] Залежність `yaml` у `server/`.** У `server/package.json` немає YAML-бібліотеки, а структурований serializer і парсер потрібні. `yaml@2.9.0` уже є в `server/pnpm-lock.yaml` транзитивно, а `agent-runner` ним користується. Потрібна згода на `cd server && pnpm add yaml@^2.6.1` (змінює `package.json` і `pnpm-lock.yaml`; це lockfile з "Do not touch"). Рекомендація: так. `fflate` уже є для zip.
2. **[AC-28 vs AC-34, runner] Перейменування агента.** `agent-runner/src/manifest.ts` кидає помилку, якщо в `.devdigest/agents/` не рівно один `*.yaml`. `commitFiles` шарить дерево і нічого не видаляє. Агент, перейменований між двома exports, лишить у гілці старий `<slug>.yaml` поряд з новим, і runner впаде. Варіанти:
   - (a) фіксований шлях `agent.yaml` (відхилення від літери AC-28);
   - (b) зберігати slug першого експорту в інсталяції (колонка `manifest_slug`) і перевикористовувати його при Update. AC-28 виконується буквально, назва в змісті маніфесту актуальна.
   - Рекомендація: (b). Редагувати runner не можна.
3. **[Контракти] Підтвердити пакет контрактів** (змінюється в обох копіях `@devdigest/shared`, client-копія: `.default()` → `.optional()`):
   - `CiExportInput`: `{repo, target (CiTarget, сервер приймає лише gha → 422 unsupported_target), action: open_pr|files, post_as, triggers: enum[], workflow_yaml?}`, `base` прибирається (беру `repos.default_branch`).
   - `CiInstallation` (поля з таблиці вище) з `status` і `last_run: {status, ran_at}|null`.
   - `CiRun`: `{id, installation_id|null, repo, agent_name, pr_number|null, status: CiRunStatus, verdict: Verdict|null, failure_reason|null, findings_count|null, critical, warning, suggestion, cost_usd|null, duration_ms|null, ran_at, job_url|null}`.
   - Нові `CiFailureReason` (`artifact_rejected|no_artifact|artifact_expired|cancelled|timed_out|stale`), `CiInstallationStatus`, `CiPreview`, `CiPreviewFile`, `CiRunMeta`, `CiRefreshInput {force, installation_id?}`, `CiRefreshResult[]` (`{installation_id, status: refreshed|skipped|failed, added, updated, skipped, failure?: {code, reset_at?}}`).
   - Маршрути: `POST /agents/:id/ci/preview`, `GET /agents/:id/ci/preview/file?path=…`, `POST /agents/:id/export-ci`, `POST /agents/:id/export-ci/archive` (binary zip), `GET /agents/:id/ci/installations`, `GET /ci/installations`, `POST /ci/refresh`, `GET /ci/runs?repo&agent_id&status&installation_id&limit`.
   - Коди помилок: `github_token_missing`, `github_permission`, `runner_bundle_missing`, `unsupported_target`, `ci_repo_taken`, `ci_export_running`, `ci_refresh_running`, `rate_limited`, `ci_pr_failed` (EC-9), `ci_no_changes` (EC-10).
   - Відповідь "так" або правки.
4. **[Vendor] Порт GitHub.** Для ingest треба додати в `GitHubClient` (`server/src/vendor/shared/adapters.ts`) методи `listWorkflowRuns`, `listRunArtifacts`, `downloadArtifact`. Також `commitFiles` має повертати, чи дерево змінилося (EC-10: порівняння tree sha, без порожнього коміту). `adapters.ts` не контракт, а vendored порт. Підтвердити, що дозвіл на vendor-правки покриває його (лише server-копія, `mocks.ts` теж оновлюється).
5. **[NFR-3, EC-34] Міграція.** `drizzle-kit generate` для NOT NULL-колонок на непорожній таблиці дасть `ADD COLUMN … NOT NULL` без default. Тому треба вручну відредагувати щойно згенерований, ще не застосований файл міграції: nullable → backfill `workspace_id` з `agents` + `status='active'` → `SET NOT NULL`, плюс перевірка дублікатів перед unique index. Для `ci_runs` без інсталяції workspace визначити неможливо. Дефолт: такі рядки видаляються (у цій кодовій базі ніхто не пише в ці таблиці, `seed.ts` теж). Підтвердити ручну правку нової міграції і цей дефолт.

Неблокуючі (дефолти, якщо не заперечите):
6. **[AC-55, EC-25]** 404 від `listWorkflowRuns` для `pending_pr`/`manual` (workflow ще не злитий) означає "0 запусків", а не помилку. Для `active` це `github_permission`.
7. **[AC-47, AC-60]** null у severity counts артефакту вважаємо 0 для gate і verdict.
8. **[NFR-10]** refresh: до 5 паралельних завантажень артефактів і дедлайн ~50 с. Після дедлайну refresh зупиняється зі збереженими рядками і failure `refresh_timeout` для інсталяції.
9. **[AC-19]** zip: інсталяція `manual` пишеться, коли сервер віддав zip (клієнт не підтверджує завершення завантаження).
10. **[Q-10]** Preview читає `agent-runner/dist`, а `dist/` не в git. Для e2e-потоку `scripts/e2e.sh` має збирати `agent-runner` (install і build, потрібні також залежності `reviewer-core`). Дефолт: додаю цей крок у `scripts/e2e.sh` (workflow-bucket), потік 12 доходить до Install без запису в GitHub.
11. **[Q-13] Закрито.** `git ls-remote` (легкі теги, SHA комітів) дає: `actions/checkout@11d5960a326750d5838078e36cf38b85af677262` (v4.4.0), `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0), `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` (v4.6.2). Це збігається з prior art. Існують і v7 (checkout v7.0.1, setup-node v7.1.0, upload-artifact v7.0.2), але беру перевірену лінію v4.

### Recommendations
1. **Взяти prior art із `upstream/full-functionality` як основу** (`constants/workflow/bundle/ingest/refresh/ports/targets/redact`, адаптерні `listWorkflowRuns`, `listRunArtifacts`, `downloadArtifact`, клієнтські `CiTab`/`ExportWizard`/`CiRunsView`/`hooks/ci.ts`). Зміни проти нього: шлях workflow `devdigest-review.yml`, перевірка `event` і `path` запуску, ліміти EC-20 (64 entries, 256 KiB, 16 MiB), `lower(repo)` у unique, поле `run_attempt`, debounce зберігається в БД (`last_refreshed_at`), а не в пам'яті. Вигода: суттєво менше нового коду; ціна: треба вичистити специфіку SPEC-14 (agent performance, secrets-status, `redact`).
2. **Q-2 як ранній gate (крок 0).** У scratch-каталозі зібрати `agent-runner`, скопіювати `dist/` у порожню теку і запустити `node index.js` на Node 22. Ризики: ESM (`package.json {"type":"module"}`), чанки на кшталт `310.index.js`, direct-run guard на `import.meta.url`. Якщо не пройде, зупинка і нове рішення користувача.
3. **Додати `GITHUB_REPOSITORY` і `PR_NUMBER` в `env:` кроку runner** (див. таблицю). Нуль ризику, відповідає `context.ts`.
4. **Тест NFR-16/AC-65 як `*.it.test.ts`** (знімок PR list, timeline і cost до/після refresh з `source='ci'` рядками; потрібен Docker). Окремо hermetic-тест на `countRunsByAgents`.
5. **Паритет контрактів** тестом у стилі `server/test/eval-contract-parity.test.ts`: серверна і клієнтська копії нових типів ідентичні, крім `.default()` → `.optional()`.

### Execution mode
Рекомендація: **multi-agent**. Робота ділиться на непересічні файли, а контракти фіксуються першим кроком.

Орієнтовний розподіл (остаточний буде у плані):
- W0: gate Q-2 (scratch-запуск runner).
- W1: контракти в обох копіях, Drizzle-схема і міграція, `yaml` у `package.json`, vendored порт GitHub.
- Після W1 паралельно:
  - W2a: чисті генератори (`constants`, slug, workflow, manifest, memory, bundle, ingest-перевірка, verdict) із hermetic-тестами.
  - W2b: адаптер Octokit (+`mocks.ts`, таймаут `commitFiles` 120 с), `ci/repository.ts`, фільтр `source` у `skills/repository.ts`.
  - W3: клієнт, зона A (хуки `lib/hooks/ci.ts`, `/ci-runs`, `nav.ts`, `messages/en/ci.json`).
  - W4: клієнт, зона B (CI-таб, візард, `VALID_TABS`).
- Далі W2c: `service`, `routes`, реєстрація модуля, `config`, `container`.
- Потім test-writer, e2e-потік і крок `scripts/e2e.sh`, ручні браузерні перевірки (оркестратор: NFR-14 на 768 px, вигляд CI Runs, візард), далі `architecture-reviewer` ∥ `security-reviewer` ∥ `plan-verifier`.

Альтернатива single-agent повільніша і дає ~1.5–2M токенів в одній сесії (досвід SPEC-10). Рішення за вами.

Чекаю відповіді на Q1–Q5 (і заперечень до дефолтів 6–11) та вибору режиму виконання, перед написанням Implementation Plan. План буде збережено в `.claude/sdd/SPEC-12/plan.md`.

---

## Hand-back 2

План збережено: `~/emdash/worktrees/devdigest-2b9b9360/l07-lab-export-to-ci/.claude/sdd/SPEC-12/plan.md`. Нічого іншого в репо я не міняв. Дві правки тексту плану (шумні фрази в кроках 9 і 11) зробив після першого запису. Файл змінився на диску і до цих правок.

## Пакети робіт і порядок
Режим multi-agent. Усі ваші відповіді Q1–Q5 і дефолти 6–11 внесені в Decisions.

- **W0 (hard stop):** gate Q-2. Збірка `agent-runner` у scratch-копії, `dist/` у порожню теку, `node index.js` на Node 22. Нічого з репо не змінюється. Якщо gate червоний, W1 і далі не стартують, і потрібне нове рішення.
- **W1 (контракти, схема, залежність):**
  - `eval-ci.ts` в обох копіях (пакет Q3, `base` прибрано, коди помилок і keys `details` задокументовані);
  - схема `ci.ts` плюс міграція: `pnpm db:generate` і ручна правка нової міграції (nullable → backfill → NOT NULL, видалення `ci_runs` без інсталяції, перевірка дублікатів, unique `(workspace_id, lower(repo))`);
  - `cd server && pnpm add yaml@^2.6.1`.
- Після W1 паралельно:
  - **W2a:** чисті генератори (`constants`, `helpers`, `workflow`, `manifest`, `memory-export`, `bundle`) і `ingest.ts`, з hermetic-тестами. Піни SHA: checkout `11d5960a…` (v4.4.0), setup-node `49933ea5…` (v4.4.0), upload-artifact `ea165f8d…` (v4.6.2).
  - **W2b:** порт GitHub у server `adapters.ts`, Octokit, `mocks.ts`, `ci/repository.ts` і `source`-фільтр у `skills/repository.ts`.
  - **W3:** клієнт, зона A. `lib/hooks/ci.ts` (сигнатури зафіксовані в плані), `/ci-runs`, GLOBAL у `nav.ts`.
  - **W4a:** клієнт, візард `ExportWizard/` (пропси зафіксовані).
  - **W4b:** клієнт, CI-таб, `VALID_TABS`, `agents.json`.
- **W2c** (після W2a і W2b): `service`, `routes`, реєстрація в `modules/index.ts`, `platform/config.ts` (`AGENT_RUNNER_DIST`), `server/README.md`.
- **W5** (`test-writer`): `service.test.ts`, `ci.it.test.ts`, `ci-pr-isolation.it.test.ts` (NFR-16), parity контрактів, `countRunsByAgents`.
- **W6:** `scripts/e2e.sh` збирає runner, плюс флоу `e2e/specs/12-export-to-ci.flow.json`.
- **Крок 16:** ручні браузерні перевірки на оркестраторі (768 px/1280 px, NFR-13/14, seed-дані через psql).
- **Review:** `architecture-reviewer` ∥ `security-reviewer` ∥ `plan-verifier`.

## Що залишилось відкритим (деталі в Risks)
1. **Спільний `client/messages/en/ci.json`** редагують W3, W4a і W4b, кожен у своїх верхньорівневих блоках. Це відступ від правила «один файл — один workstream». Оркестратор має після них перевірити `JSON.parse`. Якщо це неприйнятно, послідовність W3 → W4a → W4b для цього файла.
2. Рішення планувальника, не з вашого списку Q:
   - Update не понижує статус `active`/`manual` назад у `pending_pr`.
   - Conclusions поза переліком спеки (`neutral`, `action_required`, `startup_failure`, `stale`) не зберігаються.
   - `run.path` від GitHub порівнюється після відрізання `@ref`-суфікса.
3. Кореневий `.gitignore` каже «dist MUST be committed», а `agent-runner/.gitignore` ігнорує `dist/`. Я нічого не міняв: `dist/` будується локально, інакше EC-3.
4. Редагування в `agent-runner/` не плануються. Якщо W0 провалиться, потрібне окреме рішення.
5. Q-7, Q-8, Q-12, Q-14 лишаються прийнятими дефолтами.
6. Оновлення спеки не потрібне: у ній немає назв полів.

Далі запускайте `/run-plan` для `SPEC-12`.