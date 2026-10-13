## Hand-back 1

## Requirements review: Export to CI (worktree B, L07)

Фаза 1. План не писався. Нижче: що знайдено в коді, суперечності, рекомендації та питання. Усі питання мають мій дефолт, тож на «ок, дефолти» я можу одразу писати план.

### Source
- Повідомлення користувача (12 вимог, без ID) і 6 дизайн-скріншотів.
- Коміт `fe3a37a`: `agent-runner/` (CLAUDE.md, README.md, `insights/INSIGHTS.md`, `src/*`).
- Перевірено код: `server/src/db/schema/{ci,runs,agents,repos}.ts`, `server/src/vendor/shared/contracts/eval-ci.ts` (обидві копії), `server/src/modules/index.ts`, `server/src/adapters/{github,secrets}`, `client/src/app/agents/[id]/...`, `client/messages/en/{ci,agents,shell}.json`, `client/src/components/app-shell/helpers.ts`, `client/src/vendor/ui/nav.ts`, `.claude/skills/pr-self-review/reference/routing.json`.
- Не прочитано: `server/CLAUDE.md` і `client/CLAUDE.md` повністю (дивився лише шари onion), `docs/architecture.md`, `server/README.md` (там немає ci-роутів, `grep` порожній). Це зроблю на початку Фази 2.
- Спеки немає: у `specs/lessons/` порожньо, у `specs/` лише 01–10 (L06 eval). Статус `draft`/`approved` не застосовний. Вимоги нумерую R1–R12 (нумерація не є переписуванням).
- За конвенцією репо спочатку мав би бути SPEC-NN від `spec-creator`. Ви явно просите йти одразу в план, тому я трактую ваш текст як спеку. Ризик: розбіжності між планом і вимогами не матимуть «затвердженого» першоджерела.

### Що вже є і чого немає (факти)
- **БД.** Таблиці `ci_installations` (agent_id, repo, target_type enum gha|circle|jenkins|cli, installed_at) і `ci_runs` (installation_id, pr_number, ran_at, status, findings_count, cost_usd, github_url, source) уже є в міграціях.
  - Версії workflow, `fail_ci_on` та run-id у `ci_installations`/`ci_runs` немає. Також немає workspace_id, verdict, duration, посилання `ci_runs` на `agent_runs`.
  - `agent_runs` має `source` ('local'|'ci'), `workspace_id`, `agent_id`, `pr_id` (FK на `pull_requests`, nullable), `duration_ms`, `cost_usd`, `findings_count`, `blockers`, `status`, `score`. Поля repo, verdict, github_url, ідентифікатора запуску GitHub немає.
  - `agents.ci_fail_on` (never|critical|warning|any) уже є і вже редагується в Config-табі.
- **Контракти.** У `server/.../eval-ci.ts` є `CiTarget`, `CiFile`, `AgentManifest`, `CiExportInput`, `CiInstallation`, `CiExport`, `CiRunStatus`, `CiRun`, `CiResultArtifact`.
  - У клієнтській копії немає `AgentManifest` і імпорту `CiFailOn` (драфт уже є). Правило «обидві копії в одному коміті» діє, а `agent-runner` читає серверну копію.
  - `CiRun` не має repo, agent name (є `agent`, nullish), verdict, job-url (є `github_url`), blockers. `CiInstallation` не має версії workflow, `fail_ci_on`, остаточного статусу.
- **Сервер.** Модуля `server/src/modules/ci/` немає. Але `agent-runner/CLAUDE.md`, `README.md`, `INSIGHTS.md` і коментарі посилаються на `server/src/modules/ci/{workflow,manifest,constants}.ts` і `CiService.agentYaml`, яких не існує. Модуль треба написати саме під контракт, який runner уже очікує.
- **GitHub-адаптер.** `GitHubClient` (`octokit.ts`) уже має `commitFiles(repo,{branch,base,message,files})`, `openPullRequest`, `findOpenPr`. Ідемпотентно, одним комітом, гілка створюється з base. Це майже весь «Install → PR». Потрібен GitHub PAT з `GITHUB_TOKEN` через `container.secrets`.
- **Клієнт.** Вкладки редактора агента: config, skills, context, evals (`AgentEditor/constants.ts`, `VALID_TABS` у `agents/[id]/page.tsx` дублює ключі). Stats і CI відсутні, хоча ключі `editor.tabs.stats/ci` в `agents.json` є.
  - `ExportWizardSteps` є у vendor UI. `client/messages/en/ci.json` уже має ключі `runs`, `exportWizard`, `ciTab`, `publishDialog`. Це ранній варіант («Publish to CI», поле repo вручну, текст «Block merge … requires a GitHub App»), який розходиться з дизайном (Add to CI / Update CI config).
  - Сторінки `/ci-runs` немає. У `helpers.ts` є `activeKeyFor('/ci-runs')`, у `shell.json` є `nav.ci-runs`. У `client/src/vendor/ui/nav.ts` секції GLOBAL (Memory, Multi-Agent, Agent Performance, CI Runs зі скріншоту) немає, там лише WORKSPACE і SKILLS LAB. Пункт меню CI Runs потребує правки `*/src/vendor/**`, а це «Do not touch» без явного дозволу. Вона ще й конфліктує з іншими worktree, які додають свої GLOBAL-пункти.
- **agent-runner.** Є `runCi`, hermetic-тести, exit code за детермінованим gate від `manifest.ci_fail_on`.
  - Команда в workflow: `node .devdigest/runner/index.js`, без аргументів.
  - env: `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `PR_NUMBER`, `DEVDIGEST_POST_AS`.
  - Пише `devdigest-result.json` (`CiResultArtifact`). Нікуди нічого не POST-ить, ingest-клієнта в ньому немає. Вихідних змінних/секретів для токена інгесту немає.
  - Очікує рівно один `.devdigest/agents/*.yaml`. Memory.jsonl не читає. `post_as` не в маніфесті (відкрите питання в його INSIGHTS). Інжектується лише `OpenRouterProvider`.
  - `dist/` у `.gitignore`: сам бандл не лежить у репо, його треба збирати (`ncc`).
  - Лише `agent-runner/package-lock.json` або лише `pnpm-lock.yaml` мають існувати. Корінь CLAUDE.md каже, що `agent-runner` не в списку; сам пакет не вказаний у таблиці модулів. Два lock-файли суперечать правилу «один менеджер на модуль». Для плану важливо тільки, що ми не торкаємося lock-файлів. Рішення, який лишити, не моє (питання Q15, non-blocking).
  - `routing.json` не має правила для `agent-runner/`: усі його файли потраплять у bucket `unrouted`, тож `/pr-self-review` не підбере скіли й gates. Для файлів `server/src/modules/ci/*` і `client/src/...` routing працює нормально.

### Requirements as given
| # | Вимога (скорочено) | Статус | Примітка |
|---|---|---|---|
| R1 | Кнопка «Add to CI» відкриває Export Wizard, 4 кроки Target→Preview→Configure→Install | Clear | UI: `ExportWizardSteps` вже є. Перевірка: компонентні тести |
| R2 | Target: GitHub Actions основний; CircleCI/Jenkins/Generic CLI лише якщо генератори реально реалізовані | Ambiguous | Реалізованих генераторів немає. Q1 |
| R3 | Preview: manifest, skills, `.devdigest/memory.jsonl`, редагований `devdigest-review.yml` | Missing detail | Вміст memory.jsonl, runner-файл, Q3/Q4 |
| R4 | Configure: pull_request opened, synchronize, опційно reopened; publish = review / PR comment / exit code only | Ambiguous | `CiExportInput.triggers` — `string[]`, є `post_as`. Але runner бере post_as з env, а не з маніфесту. Q5 |
| R5 | Install: PR із файлами або zip | Missing detail | Zip: де, де Update (існуюча гілка). Q6, Q7 |
| R6 | Окрема гілка `devdigest/ci` і PR, не пише в main | Clear | `commitFiles`+`openPullRequest`. Перевірка: інтеграційний тест на mock GitHubClient |
| R7 | Workflow запускає збандлений agent-runner; `devdigest/review-action@v1` лише плейсхолдер | Conflicting | Дизайн: `node .devdigest/runner.mjs review --agent …`. Runner: `node .devdigest/runner/index.js`, без аргументів. Q2 |
| R8 | CI Runs: репо, PR, агент, verdict, знахідки, вартість, тривалість, лінк job | Missing detail | Verdict, job-url, repo не в `CiResultArtifact`/`ci_runs`. Нижче Contract coverage |
| R9 | Вкладка CI: інсталяції, версія workflow, історія, налаштування Fail CI on | Ambiguous | Q8, Q9, Q10 |
| R10 | Скоуп: `ci/`, його роути, CI Runs, вкладка CI; не чіпати multi-run service і PR-стрічку | Clear | Але див. nav (vendor) і агентні роути (ci_fail_on) |
| R11 | Ingest пише в `agent_runs` з source='ci', приймає результат лише через автентифікований endpoint або інший перевірений канал | Ambiguous / Infeasible as stated | Local-first (localhost:3001) не доступний із GitHub Actions. Q11, Q12 |
| DIAG | Scr.1–6 (wizard, CI tab) | див. розбіжності | Нижче |

Розбіжності дизайн ↔ код/вимоги:
- Preview показує 5 файлів, а runner потребує ще й `.devdigest/runner/index.js`. Це 6-й файл, мінімізований бандл, який у Preview не показується або показується як read-only.
- Install card: «with the 5 generated files» (count). З runner це 6 файлів. Q3.
- «Fail CI on»: у дизайні 3 сегменти (…Critical / Warning + / Never), у контракті 4 значення (never, critical, warning, any). Не вистачає `any`. Q9.
- Tab bar на скріні має Stats, якої немає в коді (не наш скоуп, Stats лишаємо за іншим worktree/не робимо). Запис: вкладка CI має бути додана без Stats. Q16 non-blocking.
- Скрін 2 «Active in 2 repos» і «Add repository» (dashed). Скрін 1 і `ci.json` (`repoLabel`, `repoPlaceholder: acme/payments-api`, ручний ввід) — репо вводиться текстом. Q13.
- Секція info box про required status check vs `blockMergeDesc` у `ci.json` («requires GitHub App — not available with PAT»). Це текстова розбіжність. Не блокує.

### Contract coverage
| Вимога | Значення (UI/відповідь/збереження) | Поле контракту (обидві копії) | Де зберігається | Gap |
|---|---|---|---|---|
| R1/R5 | Список файлів Preview (path/contents/editable) | `CiFile` | не зберігається (генерується) | ні. Але клієнтській копії треба `AgentManifest` для типів, якщо не потрібен — не додавати (Q-мінімум) |
| R4 | trigger chips, post_as | `CiExportInput.triggers/post_as` | немає колонок | Так: щоб Update CI config відновив налаштування, потрібні `ci_installations.triggers`, `post_as` (міграція) або перегенерація з нуля. Q8 |
| R9 | Версія workflow | немає | немає | Так → нова колонка `workflow_version` (+ константа в `ci/constants.ts`). Q8 |
| R9 | Fail CI on | `Agent.ci_fail_on` (4 значення) | `agents.ci_fail_on` | Збережено; UI-розбіжність (Q9) |
| R9 | Історія інсталяцій/апдейтів | `CiInstallation` (лише `installed_at`) | `ci_installations` | Так: немає `updated_at`, `pr_url`, останнього статусу. Q8 |
| R9 | Статус рядка інсталяції (succeeded…) + «time ago» | `CiRunStatus`, `CiRun.ran_at` | `ci_runs.status` (text) | Частково: статус беремо з останнього `ci_runs` для інсталяції |
| R8 | repo | відсутнє в `CiRun` | через `ci_installations.repo` (join) | Так → додати `repo` в `CiRun` (або віддавати окремим `CiRunRow`) |
| R8 | agent | `CiRun.agent` (nullish) | join `agents.name` | ок, зробити не nullish або лишити |
| R8 | PR | `CiRun.pr_number` | `ci_runs.pr_number` | ок |
| R8 | **verdict** | немає | немає в `ci_runs`/`agent_runs` | **Так**. `CiResultArtifact` теж без verdict (`blockers`/`gateTriggered` обчислені, але не пишуться). Треба поле в артефакті → runner зміна (runner’s `CLAUDE.md` «Do Not Touch Without Reading» лише `index.ts`/`tsconfig`; `artifact.ts` можна) |
| R8 | findings | `findings_count` (+ critical/warning/suggestion) | `ci_runs`/`agent_runs.findings_count` | ок |
| R8 | вартість | `cost_usd` | обидві | ок |
| R8 | тривалість | `CiRun.duration_s`, артефакт `duration_ms` | `agent_runs.duration_ms`; `ci_runs` колонки немає | Так (або join із `agent_runs`) |
| R8 | лінк job | `CiRun.github_url` | `ci_runs.github_url` | Runner не знає job-url; з `GITHUB_SERVER_URL/REPOSITORY/actions/runs/RUN_ID` зібрати можна. Потрібно в артефакті `run_url` або pull-ingest бере `html_url` із Actions API |
| R11 | ідемпотентність ingest | github run id + attempt | немає колонки | **Так**. Без унікального ключа повторний refresh дублює рядки. Q12 |
| R11 | зв'язок ci_runs ↔ agent_runs | немає | немає | Так → `ci_runs.agent_run_id` або дублювати метрики. Q12 |
| R11 | `agent_runs.pr_id` | FK на `pull_requests` | | PR у target repo може не бути синхронізованим → `pr_id` = null; тоді PR number/repo треба зберігати в `ci_runs`. Не блокує, але зафіксувати |
| R11 | `agent_runs.status` | text (в коді 'done', 'running', 'failed') | | Mapping `CiRunStatus` ↔ `agent_runs.status` треба зафіксувати (CI Runs показує succeeded/failed/no_findings/running) |

Нові колонки (міграції): мінімум `ci_installations.{workflow_version, post_as, triggers, updated_at}`, `ci_runs.{github_run_id, agent_run_id, repo, verdict, duration_ms}`, можливо `workspace_id`. Нові міграції генеруються через `pnpm db:generate` (редагувати застосовані не можна). Це не заборонено, але прошу підтвердження (Risks).

### Clarifying questions (blocking, якщо не позначено)
1. [R2] Які цілі показувати у Target? Мій дефолт: показати лише GitHub Actions як вибрану й доступну; CircleCI/Jenkins/Generic CLI відрендерити як disabled-картки з бейджем «soon» (дизайн збережений, жодних генераторів-заглушок). Альтернатива: прибрати їх зовсім. Чому важливо: якщо хоч один генератор потрібен, це ще один файл генерації й тести.
2. [R7] Як узгодити дизайн (`node .devdigest/runner.mjs review --agent security-reviewer`) із реальним runner (`node .devdigest/runner/index.js`, без `--agent`)? Дефолт: у workflow писати `node .devdigest/runner/index.js` (runner не змінюємо). У дизайні це лише ілюстративний рядок, у спеку не переносимо. Бандл `index.js` додається в PR як шостий файл. Альтернатива: змінити runner (CLI `review --agent`), це зачепить `src/index.ts` («Do Not Touch Without Reading»).
3. [R3/R5/R7] Як бандл потрапляє в PR/zip? Дефолт: сервер читає `agent-runner/dist/index.js` із диска (шлях відносно repo root / env-змінна), додає як `.devdigest/runner/index.js`; якщо файла немає (`dist/` gitignored, не зібрано) — 409 з зрозумілою помилкою «run `cd agent-runner && pnpm build`»; `scripts/dev.sh` отримує крок збірки. Preview показує його як read-only файл («bundled runner, ~NNN KB»), решту — як у дизайні. Лічильник файлів в Install = 6. Альтернатива: комітити `dist/` (суперечить `.gitignore` пакета).
4. [R3] Що в `.devdigest/memory.jsonl`? Дефолт: порожній файл або вибірка з таблиці `memory` робочого простору, але runner його не читає, тож для L07 це лише плейсхолдер. Пропоную експортувати релевантні записи `memory` для repo (scope repo/global) у JSONL, якщо вони є, інакше порожній файл. Потрібно рішення: порожній (простіше, нічого не ризикує викинути в публічний PR) чи реальний експорт (витік приватних записів в чужий репо!). Рекомендую порожній.
5. [R4] Де живе `post_as` у runner? Дефолт: прокинути як env у workflow (`DEVDIGEST_POST_AS: github_review`) — runner уже це читає, змін у ньому немає (закриває Open Question у `agent-runner/insights/INSIGHTS.md`). Триггери йдуть у `on.pull_request.types`. Збережений вибір — у `ci_installations.post_as/triggers`.
6. [R5] Zip: де генерується? Дефолт: сервер повертає `files[]` (вже є в `CiExport`), клієнт збирає zip у браузері (без нових залежностей: ручний store-only zip на ~40 рядків або `fflate`). Нова npm-залежність у `client/` змінює `pnpm-lock.yaml` (потрібен дозвіл). Альтернатива: `GET /agents/:id/export-ci.zip` на сервері (теж залежність). Рекомендую серверний ендпоїнт без залежностей: store-only zip зібраний вручну в `ci/zip.ts`.
7. [R6] Семантика «Open PR» при повторі й «Update CI config»: Дефолт: «Update CI config» = повторно відкрити wizard для вже встановленого репо з попередніми значеннями, перегенерувати файли (нова версія workflow, ту саму `devdigest/ci`), `commitFiles` додає новий коміт, `findOpenPr` перевикористовує відкритий PR; якщо PR уже змерджено, створюється новий PR із тієї самої гілки (потрібно, щоб гілка відгалужувалась від свіжого base). Підтвердіть.
8. [R9] «Версія workflow» і історія: Дефолт: `workflow_version` = цілочисельна константа в `ci/constants.ts`, яку піднімаємо при зміні генератора; зберігається в `ci_installations`; «історія» = список записів інсталяції плюс останні `ci_runs` цього агента; без окремої таблиці історії. Альтернатива: окрема `ci_installation_events`. Рекомендую дефолт.
9. [R9] «Fail CI on»: це те саме `agents.ci_fail_on` (редагується також у Config), чи окреме поле інсталяції? Дефолт: те саме поле агента (єдине джерело істини), сегменти Critical / Warning+ / Any / Never (4, як у контракті; дизайн має 3), потрапляє до runner через `ci_fail_on` у `.devdigest/agents/<slug>.yaml`; зміна в UI показує підказку «Update CI config, щоб застосувати у репо», бо runner читає маніфест, а не студію. Потрібно: дозвіл відхилитись від дизайну (4-й сегмент) чи прибрати `any`?
10. [R9] Один агент на репо чи кілька? Runner падає, якщо в `.devdigest/agents/` більше одного yaml, і workflow `devdigest-review.yml` один. Тож другий агент у тому самому репо зламає перший. Дефолт: рівно один агент на репо; сервер блокує (409, `details: {installation_id, agent_id, agent_name}`) спробу встановити другого агента в репо, де вже є інсталяція іншого агента. Альтернатива: змінити runner (параметр `DEVDIGEST_AGENT`, назва workflow на агента) — це зміна `agent-runner`.
11. [R11] Канал ingest. Локальний сервер (localhost:3001) з GitHub Actions недоступний, а runner нічого не відправляє. Дефолт: **pull-модель**. Студія при Refresh (кнопка «Refresh» вже є в `ci.json`) через `GITHUB_TOKEN` (PAT) сама викликає GitHub Actions API: список runs workflow `devdigest-review.yml`, завантаження артефакту `devdigest-result` і `safeParse(CiResultArtifact)`. «Перевірений канал» = автентифікований GitHub API; публічного endpoint не створюємо. Це потребує: (а) у workflow `actions/upload-artifact` крок, `permissions: pull-requests: write, contents: read, actions: read`; (б) розпаковка zip артефакту на сервері (потрібен unzip: `fflate`/`yauzl` → нова залежність у `server/package.json` + lockfile, або писати мінімальний inflate через `node:zlib`, це реально); (в) PAT має `actions:read`. Альтернатива: push-модель (runner POST на публічний URL студії + токен на інсталяцію) вимагає тунелю й зміни runner. Підтвердіть pull.
12. [R11] Ідемпотентність і форма запису. Дефолт: унікальний ключ `(ci_installation_id, github_run_id, run_attempt)`; ingest в одній транзакції створює `agent_runs` (source='ci', agent_id, workspace_id, status, duration_ms, cost_usd, findings_count, blockers, `pr_id` = null якщо PR не синхронізований) і `ci_runs` із `agent_run_id`; `GET /ci-runs` читає ci_runs + join. Verdict обчислюємо в runner (в артефакт додається `verdict` і `run_url`), тому `CiResultArtifact` розширюємо двома nullish-полями (старі артефакти лишаються валідними). Це змінює `agent-runner/src/artifact.ts` і `run.ts` (не `index.ts`). Підтвердіть, що правка runner припустима.
13. [R9/R1] Який репозиторій інсталюється? Дефолт: поле «Target repository» як у `ci.json` (`owner/name`), попередньо заповнене репо активного воркспейсу (`repos.full_name`); «Add repository» і «Add to CI» відкривають той самий wizard; репо не обмежені підключеними в DevDigest. Альтернатива: picker лише з таблиці `repos`. Дефолт простіший і відповідає вже готовим рядкам `ci.json`.
14. [R5/R6] Звідки токен для PR? Дефолт: `container.secrets.get('GITHUB_TOKEN')` (як у `repos/service.ts`); якщо немає — 400/409 з кодом на кшталт `github_token_missing` і підказкою піти в Settings → API Keys. Потрібні права PAT: `contents:write`, `pull-requests:write`, `actions:read`. Секрет `OPENROUTER_API_KEY` у репо користувач додає вручну (текст `secretNote` з `ci.json`); автоматично через GitHub API не створюємо (потрібне шифрування libsodium + `secrets:write`). Також: runner підтримує лише `OpenRouterProvider`; якщо `agent.provider` не `openrouter`, експорт має або відмовляти, або показувати попередження. Дефолт: 422 на не-openrouter агентах із поясненням. Підтвердіть.
15. (non-blocking) `agent-runner` має обидва lock-файли. Дефолт: не чіпаю жодного. Це питання до вас: який менеджер для пакета (корінь CLAUDE.md пакет не згадує). Також: чи оновлювати кореневий CLAUDE.md/`routing.json`, щоб `agent-runner/` не був `unrouted` (це `.claude/**`, окремий дозвіл).
16. (non-blocking) Вкладка Stats зі скріна не входить у скоуп (відсутня в коді, не в вимогах). CI-вкладка додається до `TABS` + `VALID_TABS`.
17. [R10] Пункт сайдбару CI Runs: `client/src/vendor/ui/nav.ts` має лише WORKSPACE і SKILLS LAB, без GLOBAL. Дефолт: не чіпаю vendor-файл; сторінку `/ci-runs` створюю (`client/src/app/ci-runs/`), `activeKeyFor` і `nav.ci-runs` уже готові, а пункт меню додаю лише з вашим явним дозволом правити `nav.ts` (і узгодженням з іншими worktree, що теж додають GLOBAL-пункти, інакше конфлікт). Без дозволу сторінка доступна за URL і через command palette не з'явиться.

### Recommendations
1. Пулл-ingest замість публічного endpoint (див. Q11). Змінює: серверний `ci/ingest`, GitHub-запити; чому: local-first, нічого не відкриваємо назовні; ціна: PAT з `actions:read`, розпаковка zip, затримка до Refresh.
2. Одна гілка/один workflow на агента не підтримується; тому обмеження «один агент на репо» (Q10) закласти в контракт 409 з `details` ключами `installation_id`, `agent_id`, `agent_name`, щоб клієнт не вгадував.
3. Не експортувати реальні `memory` записи в чужий репо (Q4): ризик витоку приватних знань; ціна: memory.jsonl порожній.
4. Верифікувати runner-зміну (`verdict`, `run_url`) тестом у `run.test.ts` і `CiResultArtifact` у обох контрактах.
5. Один модуль: `server/src/modules/ci/{routes,service,repository,workflow,manifest,constants,ingest,zip}.ts` за onion-шарами; `workflow.ts` і `manifest.ts` — чисті функції з unit-тестами (golden-файл YAML). Тест, що згенерований маніфест проходить `AgentManifest.safeParse` (захист від дрейфу з runner).
6. Безпека workflow: `on: pull_request` (не `pull_request_target`), мінімальні `permissions`, секрет-ключ лише в env кроку, пропуск fork-PR (`if: github.event.pull_request.head.repo.full_name == github.repository`), оскільки секрети форкам не видаються й runner це лише «інформує». Ціна: форк-PR не рев'юються.
7. Менший перший зріз: спершу сервер (ci/ + міграція + контракти), потім wizard, потім вкладка CI, потім CI Runs. Не робити CircleCI/Jenkins/CLI.
8. Ручні браузерні перевірки (wizard, CI tab, CI Runs) робить оркестратор (`/run-plan`, Phase 2b), окремим кроком.

### Execution mode
Питання до вас: single-agent чи multi-agent? Моя рекомендація: **multi-agent**, бо файли розділяються чисто: W1 contracts (обидві vendor-копії + міграція + схема, `pnpm db:generate`, runner `artifact.ts`), далі паралельно W2 server `ci/` модуль і W3 client. Клієнт треба буде розбити на дві зони (wizard vs вкладка CI + сторінка CI Runs) за правилом >6 кроків, W4 test-writer, потім architecture-reviewer ∥ security-reviewer ∥ plan-verifier. Контракт-крок (кілька типів + міграція) виправдовує окремий W1. Якщо ви хочете менший ризик і мінімум координації, single-agent теж підійде, але буде довше.

### Ризики для окремого дозволу (не вирішую сам)
- Нова міграція (`pnpm db:generate`); редагування vendor-контрактів у `*/src/vendor/shared/contracts/` у обох копіях; правка `client/src/vendor/ui/nav.ts` (Q17); нові залежності/lockfile (zip/unzip, Q6/Q11); зміна `agent-runner/src/artifact.ts`/`run.ts` (Q12, Q3 збірка); `.claude/skills/.../routing.json` для `agent-runner/` (Q15).
- Існуюча `ci.json` частково застаріла (publishDialog, ciTab.publish) — буде переписана під дизайн.
- Спеки немає: якщо хочете формальну трасованість, `spec-creator` має створити SPEC-NN із цими R1–R12 і відповідями.

Awaiting answers (хоча б «дефолти приймаю» плюс відповіді на Q9, Q11, Q12, Q17 і режим виконання) before writing the Implementation Plan.