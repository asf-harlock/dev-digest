## Hand-back 1

## Spec intake: Eval Pipeline для DevDigest (L06 homework)

### Framing
Тому, хто налаштовує агента-рев'юера, зараз нічим перевірити, чи зміна system prompt, моделі або прив'язаного skill зробила агента кращим чи гіршим. Готово — це коли такий користувач одним кліком робить eval case з уже прийнятого (accepted) або відхиленого (dismissed) finding, запускає агента по всьому набору case на заморожених вхідних даних і бачить recall, precision та citation_accuracy, пораховані кодом без LLM. Потім він порівнює два запуски («старий prompt проти нового») поруч, разом із diff промпта.

Багато чого вже є, бракує точок входу та оркестрації. Що вже є:
- таблиці `eval_cases` і `eval_runs` (`server/src/db/schema/eval.ts:7-35`) — вже в міграціях, `0019_snapshot.json:2646,2734`;
- Zod-контракти `EvalCase`, `EvalRun`, `EvalCaseInput`, `EvalRunRecord`, `EvalDashboard` в обох копіях vendor (`server/src/vendor/shared/contracts/eval-ci.ts:20-89`, `knowledge.ts:167-202`);
- версіонування агента (`agents.version` + `agent_versions`, `server/src/modules/agents/repository.ts:111-213`) і маршрути `GET /agents/:id/versions[/:version]` (`agents/routes.ts:150-158`);
- заготовлені i18n-ключі `client/messages/en/eval.json`;
- UI-примітиви `MetricCard`, `Sparkline`, `LineChart` у `client/src/vendor/ui/charts/`.

Ні в `server/src/modules`, ні в client немає жодного коду, який читає або пише eval-таблиці (Grep по `evalCases|evalRuns|PluginEvalCase` знаходить тільки `db/schema*`).

### Placement
Module(s): server + client + shared contracts (обидві копії vendor), можливо reviewer-core (якщо scorer житиме там). Файл: `specs/08-eval-pipeline.md`, SPEC-08 (найвищий існуючий — `specs/07-pr-context.md`). Supersedes: —

Конфлікт імен: курс вимагає `specs/eval-pipeline.md`. Мені дозволено писати тільки `specs/NN-*.md`, тож файл за вимогою курсу (копію або вказівник) має створити головна сесія. Окремо: скрипта `verify:l06` у репо **немає** — Grep по `verify:l06|verify-l06` по всьому репо та по `"verify` у всіх `package.json` нічого не знайшов. Тому неможливо перевірити, чи він шукає файл саме за точним шляхом, див. R1 і Q1.

### Insights read
- Root `INSIGHTS.md` — релевантний (фіча зачіпає кілька модулів): копії vendor (`.default` → `.optional` у client), правка vendor потребує прямого дозволу користувача, фейкові секрети у фікстурах, пошук попередньої реалізації через `git log -S`.
- `server/INSIGHTS.md` — релевантний: `findings` без `workspace_id`, 422 замість 400, POST без body, двічі типізований facade.
- `client/INSIGHTS.md` — релевантний: `isPending` ≠ прогрес, ключ табу в двох місцях, глобальні toast, `nav.ts`, `useRelativeTime`.
- `reviewer-core/INSIGHTS.md` — релевантний: verdict і score беруться тільки з grounded findings.
- Пропустив `e2e/` і `mcp/`: цей spec їх не зачіпає, крім того, що e2e-flow згадано як майбутній тест.

### Sources read
| Source | Що я з нього взяв |
|---|---|
| Brief (текст користувача) | 5 user stories; must_find / must_not_flag; `POST /agents/:id/eval-runs`; scoring без LLM; Evals tab + Eval Dashboard; експеримент; acceptance: ≥8 case, `verify:l06`, `specs/eval-pipeline.md` |
| Mockup 1 (FindingCard) | Кнопка «Turn into eval case» в action row розгорнутої картки, поряд з Accept/Dismiss/Learn/Reply. Learn і Reply в поточному коді не існують |
| Mockup 2 (Eval Dashboard) | Пункт сайдбару під Skills Lab; список карток агентів (модель, «Last run vN · дата · x/y pass», sparkline, 3 метрики); таблиця останніх запусків по всіх агентах; кнопка «Run all agents» |
| Mockup 3 (дашборд одного агента) | Банер-алерт; 3 KPI з дельтою, причому дельта в частках («↑0.04»); METRIC TREND; RECENT RUNS з чекбоксами + Compare; колонка COST; фільтр «30 days»; dropdown вибору агента |
| Mockup 4 (Compare) | 4 картки дельт (recall/precision/citation/cost, «▲4pt»); diff system prompt v6→v7; «Promote v7» |
| Mockup 5 (Evals tab) | KPI + «Traces passed 17/20»; «Eval cases 3/5 passing»; рядки зі статусом pass/fail/never run, «expected 1 finding, got 1», тег «CRITICAL · security» / «empty []»; запуск, редагування і видалення по рядку; «+ New eval case» |
| Mockup 6 (модалка case) | Name; Input Diff/Files/PR meta; Expected output як JSON-масив findings; банер «Last run passed · 1.8s · $0.02»; «Run on save», «Run case». У diff видно реалістичний `sk_live_51H8…` |
| `server/src/db/schema/eval.ts:7-35` | `eval_cases(owner_kind, owner_id без FK, input_diff, input_files, input_meta, expected_output jsonb)`; `eval_runs` — **по одному рядку на case**: без групування в запуск, без версії агента, без статусу, без `workspace_id` |
| `server/src/vendor/shared/contracts/eval-ci.ts`, `knowledge.ts:167-202` | `expected_output: z.unknown()`; `EvalRun` з `per_trace`; `EvalDashboard.alert: string \| null`. Client-копія `eval-ci.ts:3` імпортує менше символів, тобто копії розійшлися |
| `server/src/modules/agents/repository.ts:111-213` | Будь-яка зміна конфігу піднімає `version` і знімає snapshot `config_json`. `skills` у snapshot — **тільки id**, без тіл |
| `server/src/modules/reviews/run-executor.ts:124-371` | Живий запуск тягне git diff поточного head, intent, PR context, repo-intel, project context; scope filter; пише `reviews`/`findings`/`agent_runs` |
| `reviewer-core/src/review/run.ts:45-132,218-259`, `grounding.ts:41-90` | `reviewPullRequest(ReviewInput)` — чистий, без I/O; `dropped[]` і `grounding` «k/n passed»; перетин діапазонів рядків — це вже наявне правило |
| `server/src/modules/reviews/diff-loader.ts:12-44`, `schema/pulls.ts:39-50` | Diff — це `git diff base...head` або fallback з `pr_files.patch` (останній імпорт PR) |
| `server/src/modules/reviews/repository/review.repo.ts:120-144` | accept і dismiss взаємовиключні, рішення можна перемкнути |
| `server/src/db/schema/reviews.ts:18,35-61` | `reviews.agentId` nullable; `findings` без `workspace_id` |
| `client/.../FindingCard/FindingCard.tsx:56,96-117` | Тільки Accept/Dismiss; header — `div onClick`, з клавіатури недоступний |
| `client/src/app/agents/[id]/page.tsx:15`, `AgentEditor/constants.ts:12-14` | Таби config/skills/context; `VALID_TABS` дублюється |
| `client/src/vendor/ui/nav.ts:21-38` | Пункту Eval Dashboard немає |
| `client/src/app/skills/.../EvalsTab.tsx:8-16`, `SkillEditor.tsx:57` | Evals для skill — placeholder, кнопка «Run on evals» disabled |
| `client/messages/en/eval.json` | Заготовлені ключі dashboard/caseEditor/evalsTab; є тільки локаль `en` |
| `server/src/db/seed.ts:338-354` | У seed 2 findings, жодного рішення, тож ≥8 case сід не дає |
| `evals/README.md:26` | Upstream має гілку `l06-evals`; можливе джерело `verify:l06` |

### Constraints
- Engine повністю без I/O; зовнішні дані подаються тільки полями `ReviewInput` — `reviewer-core/CLAUDE.md:14-18`
- Контракт міняється в обох копіях vendor в одному коміті — root `CLAUDE.md` Gotchas. Правку `*/src/vendor/**` має явно дозволити користувач (root `INSIGHTS.md` 2026-09-30)
- Міграції через `pnpm db:generate`, при старті не запускаються — root `CLAUDE.md`
- Кожен handler починається з `getContext()`. Таблиці без `workspace_id` скопляться тільки через join з батьківською (`eval_runs` → `eval_cases`) — `server/CLAUDE.md`; `server/INSIGHTS.md` 2026-09-17
- Fire-and-forget для довгих робіт; `buildApp()` при старті прибирає завислі `running` — `server/CLAUDE.md` Gotchas
- Невалідний ввід дає 422, не 400 — `server/INSIGHTS.md` 2026-09-25
- Новий таб агента треба додати в `constants.ts` **і** у `VALID_TABS` — `client/INSIGHTS.md` 2026-09-29
- `isPending` не означає прогрес; помилки вже показує глобальний toast — `client/INSIGHTS.md` 2026-09-24
- Весь UI-текст через next-intl, неймспейс `eval` вже існує — `client/CLAUDE.md`; `client/messages/en/eval.json`
- Dismissed findings не враховуються в лічильниках — root `INSIGHTS.md` Decisions
- Client імпортує з `@devdigest/shared` тільки типи (runtime-значення ламає `next build`) — `client/INSIGHTS.md` 2026-09-30

### Findings
| ID | Pri | Lens | Finding | Evidence | Proposal |
|---|---|---|---|---|---|
| F1 | high | Cross-module | У `eval_runs` один рядок на case. Немає сутності «запуск набору»: ні групування, ні версії агента, ні статусу, ні агрегатів, ні `workspace_id`. Історію і Compare на цьому не побудувати | `server/src/db/schema/eval.ts:22-35` | Додати сутність запуску на рівні набору (агент, версія, snapshot конфігу, статус, агрегати, cost, лічильники case, час); `eval_runs` прив'язати до неї. Нова міграція |
| F2 | high | Corner case | «vN» уже існує (`agents.version`), але snapshot містить тільки id skills, без тіл. Правка тіла skill не піднімає версію агента, тож два запуски «v7» можуть мати різні промпти, і Compare збреше | `agents/repository.ts:193-210`; `server/INSIGHTS.md` 2026-09-19 | Кожен запуск зберігає версію агента **і** ефективні входи: system prompt, model, provider, strategy, розв'язані тіла skills. Compare робить diff саме цього snapshot |
| F3 | high | Cross-module | Живий запуск залежить від нестабільних входів: поточний head, intent, PR/project context, repo-intel, scope filter. Порівнянність між версіями без «заморозки» не гарантована | `run-executor.ts:124-170,250-316,348-389` | Eval-запуск подає в `reviewPullRequest` тільки заморожений case (diff-фрагмент + PR title/body) і конфіг агента. Без enrichment і без scope filter |
| F4 | high | Corner case | Рядки finding рахуються від head на момент review, а `pr_files.patch` — від останнього імпорту. Після force-push фрагмент може не містити рядків finding, і must_find стає невиконуваним | `diff-loader.ts:33-44`; `pulls.ts:39-50`; `grounding.ts:41-46` | При створенні case перевіряти, що діапазон очікування перетинає hunk замороженого фрагмента (те саме правило, що в grounding). Якщо ні — 422 і зрозуміле повідомлення |
| F5 | high | Missing state | Знаменник precision не визначений: брифу відповідає і «всі незіставлені findings — шум», і «шум — тільки ті, що перекривають must_not_flag» | бриф п.4; `eval-ci.ts:33-45` | **Рекомендую labeled-only**: precision = TP / (TP + FP), де TP — findings, що збіглися з must_find, а FP — findings, що перекривають регіон must_not_flag. Незіставлені findings показувати окремим лічильником «unlabeled». Без цього агент, що знайшов справжній неврахований баг, буде покараний |
| F6 | high | Missing state | Нульові знаменники: немає must_find case → recall 0/0; немає позначених findings → precision 0/0; grounding «0/0 passed» → citation 0/0 | `grounding.ts:87-90`; `run.ts:218-220` | Метрика з нульовим знаменником = null і показується як «—», а не 0%. Дельта до/від null = «—» |
| F7 | high | Cross-module | Модель case суперечлива: мокап 6 показує JSON-масив findings і «empty []», бриф — must_find/must_not_flag з file:line, контракт — `expected_output: z.unknown()` | mockup 6; mockup 5; `knowledge.ts:191-201`; `eval-ci.ts:27` | Одне очікування на case: `{type: must_find \| must_not_flag, file, start_line, end_line}` + snapshot severity/category/title тільки для відображення. Pass для must_find = є finding з тим самим файлом і перекриттям діапазону; pass для must_not_flag = таких findings немає. Контракт оновити в обох копіях vendor, з дозволом користувача |
| F8 | high | Corner case | N case × виклик LLM — це десятки секунд або хвилини. Немає захисту від дубля: подвійний клік або дві вкладки запускають два платні запуски | `server/CLAUDE.md` (fire-and-forget); `client/INSIGHTS.md` 2026-09-24 | `POST /agents/:id/eval-runs` одразу повертає id запуску. Поки триває запуск для того самого агента — 409. Client опитує до завершення з таймаутом. Завислий `running` після рестарту позначається failed |
| F9 | high | Missing state | Помилка на одному case (немає ключа, LLM впав) не має визначеної поведінки | `run-executor.ts:232-237` | Case отримує статус `error` і не входить у метрики; запуск позначається «partial» з лічильником помилок; якщо впали всі — `failed` з причиною |
| F10 | high | Missing state | Кнопка на FindingCard: finding без рішення; агент видалений (`reviews.agentId` = null); повторний case з того самого finding; рішення змінене після створення case | `reviews.ts:18`; `review.repo.ts:120-144`; mockup 1 | Немає рішення → disabled + підказка. Немає агента → disabled. Дубль → 409 і стан «вже є case». Case фіксує тип очікування на момент створення і пізніше не змінюється |
| F11 | med | Cross-module | Якщо гнати eval через `ReviewRunExecutor`, з'являться рядки `reviews`/`findings`/`agent_runs`, і зсунуться лічильники PR, cost-rollup та статистика агента | `run-executor.ts:397-440`; root `INSIGHTS.md` Decisions | NFR: eval-запуск не пише в `reviews`, `findings`, `agent_runs`, `run_traces` |
| F12 | med | Corner case | `eval_cases.owner_id` не має FK на `agents`; після видалення агента case стають сиротами | `eval.ts:12-13`; `agents/repository.ts:79-85` | Видалення агента видаляє його case і запуски, або вони ніде не показуються |
| F13 | med | UX | `EvalDashboard.alert` — рядок, який складає сервер, тобто англійський текст в обхід i18n | `eval-ci.ts:87`; mockup 3 | Структурований алерт (метрика, дельта, версія) з текстом на client через i18n, або взагалі прибрати банер |
| F14 | med | Corner case | Агента відредаговано під час запуску: до якої версії віднести результат? | `agents/repository.ts:115-149` | Конфіг фіксується на старті; запуск належить версії, яка була на старті |
| F15 | med | Untrusted | У замороженому diff можуть бути справжні секрети: вони зберігаються, показуються і знову йдуть у LLM. У мокапі реалістичний `sk_live_51H8…`; така фікстура блокує push | mockup 6; root `INSIGHTS.md` 2026-09-24 | У фікстурах і тестах тільки `sk_live_xxx`. Diff показується як текст з екрануванням; редагування (redaction) поза scope, якщо ви не вирішите інакше |
| F16 | med | Cross-module | Таб Evals і пункт сайдбару треба додати в кількох місцях; `nav.ts` — статичні дані в vendor | `page.tsx:15`; `AgentEditor/constants.ts:12-14`; `nav.ts:30-37`; `client/INSIGHTS.md` 2026-09-20 | Вимога: `?tab=evals` відкриває таб; пункт «Eval Dashboard» у Skills Lab активний на своїх маршрутах |
| F17 | med | Corner case | LLM недетермінована, тож «метрики помітно рухаються» може бути шумом, а не ефектом промпта | pending R3 | Ручна процедура експерименту з контрастною зміною промпта; показувати n case поруч з метриками |
| F18 | med | First-run | ≥8 case потребують реальних прийнятих або відхилених findings, а seed дає 2 findings без рішень | `seed.ts:338-354` | Розділ ручної процедури: прогнати review, розставити рішення, зробити ≥8 case обох типів. Empty state у табі з підказкою «йди до PR» |
| F19 | med | Scope | У мокапах є Promote vN (маршруту restore немає), Run all agents, 30 days, запуск одного case, Run on save, ручний «New eval case», таби Stats/CI, evals для skills | `agents/routes.ts:86-214`; `SkillEditor.tsx:57`; mockups 2-6 | За замовчуванням усе це Non-goals, див. Q4 |
| F20 | med | Cross-module | Копії vendor уже розійшлися; `.default()` у server-копії ламає client-фікстури | `client/.../eval-ci.ts:3` vs server `:3`; root `INSIGHTS.md` 2026-09-29 | У client-копії `.optional()` + `?? []`; жодних runtime-імпортів з shared у client |
| F21 | med | NFR | «Scoring makes zero LLM calls» треба мати змогу перевірити | бриф п.4 | NFR: scorer — чиста функція від (очікування, findings, grounding) без доступу до LLM-провайдера; тест на mock-провайдері перевіряє 0 викликів під час scoring |
| F22 | low | UX | Одиниці дельти не узгоджені: «↑0.04» (mockup 3) проти «▲4pt» (mockups 4-5) | mockups 3,4,5 | Скрізь пункти (pt) |
| F23 | low | UX | Unknown vs zero для cost: `costUsd` = null, коли ціна невідома | `run.ts:206` | null → «—», а не «$0.00» |
| F24 | low | Inherited debt | Header FindingCard — `div onClick` без клавіатурного доступу; нова кнопка успадкує сусідство | `FindingCard.tsx:56` | Нова дія — справжня `Button` у body з i18n-підписом; виправлення header поза scope |
| F25 | low | Untrusted | Назва case за замовчуванням береться з `finding.title`, який згенерувала модель | `findings.title` (`reviews.ts:45`) | Slug з обмеженням довжини; користувач може перейменувати; показ тільки як текст |

### Approaches
| Option | What | Touches | Size | Risk |
|---|---|---|---|---|
| A — найменша зміна | Таблиці лишаються як є; групування в запуск і версія лежать у `eval_runs.actual_output` jsonb (спільний batch id) | server (новий модуль), client, контракти | S | Агрегати, історія, статус і 409 — через jsonb-запити; немає `workspace_id` і статусу на рівні запуску, тож важко прибрати завислі запуски |
| **B — рекомендую** | Нова сутність запуску набору (статус, версія + snapshot ефективного конфігу, агрегати, cost) + посилання з `eval_runs`; `eval_cases` отримує посилання на вихідний finding. Фоновий запуск, опитування, scoring — чиста функція поряд з grounding | server (модуль `evals`, міграція), client (таб, сторінка, кнопка, модалка Compare), обидві копії vendor | M | Міграція + правка vendor (потрібен дозвіл користувача) |
| C — повторне використання pipeline | Гнати case через `ReviewRunExecutor` з «синтетичним» PR, оцінювати persisted findings | server/reviews | M | Пише в `reviews`/`findings`/`agent_runs` і зсуває лічильники (F11); тягне незаморожені enrichments (F3) |

Recommendation: B. A вибрав би тільки якщо `verify:l06` перевіряє, що схему `eval_*` не змінено («schema given ready-made») — це pending R1. Якщо R2 знайде попередню реалізацію в git — взяти її форму за основу B.

### Research requests (for the caller — run one `researcher` per row, in parallel)
| ID | Question | Scope | Where to look | Unblocks |
|---|---|---|---|---|
| R1 | Що таке `pnpm verify:l06`: в якому `package.json` або скрипті він визначений і що саме перевіряє (точний шлях `specs/eval-pipeline.md`? схему `eval_*`? кількість case? маршрути)? | both | `git log -S 'verify:l06' --oneline --all`; `git branch -a`, remotes (upstream, гілка `l06-evals` — `evals/README.md:26`); `git show <ref>:<path>/package.json`; репо курсу, якщо є remote | Q1, вибір A/B, F19 |
| R2 | Чи є в історії git попередня реалізація eval pipeline (маршрути `eval-runs`, scorer, `EvalsTab` агента, хуки dashboard), і які метрики та групування запусків вона використовувала? | repo | `git log -S 'eval-runs' --all`, `-S 'evalRuns'`, `-S 'EvalDashboard'`, `-S 'must_not_flag'`, `-S 'citation_accuracy' --oneline --all`; походження `client/messages/en/eval.json` (`git log --follow`) | F1, F5, F7, вибір підходу |
| R3 | Чи передає review-шлях температуру або seed провайдеру, і з якими значеннями за замовчуванням (тобто наскільки недетерміновані повтори на тому самому вході)? | repo | `reviewer-core/src/llm/*`, `server/src/adapters/llm/*`, `StructuredRequest` у `server/src/vendor/shared/adapters.ts` | F17, NFR повторюваності |
| R4 | Як інші бенчмарки та eval-и code-review агентів рахують precision, коли частина findings агента не має розмітки (unlabeled), і як ставляться до must-not-flag/negative cases? | external | публічні методики: Qodo PR-Agent benchmark, CodeRabbit/Greptile eval-пости, SWE-bench-подібні code-review датасети, статті про LLM code review evaluation | F5, Q2 |

### Questions for the user
Blocking:
- **Q1** Де лежить spec? Мені дозволено тільки `specs/08-eval-pipeline.md` (SPEC-08). Курс вимагає `specs/eval-pipeline.md` (pending R1: чи шукає `verify:l06` саме цей шлях). — my default: я пишу `specs/08-eval-pipeline.md`; після approve головна сесія створює `specs/eval-pipeline.md` як копію, якщо R1 покаже, що перевірка дивиться на вміст, або як вказівник на SPEC-08 в іншому разі.
- **Q2** Як рахувати знаменник precision? — my default: labeled-only (TP / (TP + FP по must_not_flag)), незіставлені findings — окремий лічильник «unlabeled». Альтернатива: всі незіставлені findings — шум.
- **Q3** Що саме заморожує case? — my default: patch файлу finding (усі hunks цього файлу з того diff, по якому йшов review) + PR title/body. Eval-запуск без repo-intel, project/PR context, intent і scope filter. Альтернативи: увесь diff PR або тільки hunk finding.

Non-blocking (підуть у `Open questions`, якщо не відповісте):
- **Q4** Що поза scope? — my default: Non-goals — «Promote vN», «Run all agents», фільтр «30 days», запуск одного case і «Run on save», ручний «+ New eval case» з нуля, таби Stats/CI, evals для skills, банер-алерт. **В scope:** перегляд case у модалці (тільки читання; змінити можна name), видалення case, Compare двох запусків з diff system prompt і cost.
- **Q5** Що означає «version vN»? — my default: `agents.version` на старті запуску + snapshot ефективних входів (F2). Compare показує diff system prompt зі snapshot.
- **Q6** Чи має збіг враховувати severity/category? — my default: ні, тільки файл + перекриття діапазону рядків (як у брифі).
- **Q7** Case з помилкою LLM? — my default: виключається з метрик, запуск позначається «partial» (F9).
- **Q8** До якого агента йде case? — my default: до агента, що створив finding (`reviews.agent_id`). Вибору агента в UI немає.
- **Q9** Що з case, коли видаляють агента? — my default: case і запуски видаляються разом з агентом.
- **Q10** Як виконувати case? — my default: послідовно в одному фоновому запуску. Таймаут опитування на client — 10 хв, після нього повідомлення «запуск ще триває / перевірте пізніше».

Reply with answers, or "accept defaults", or per-finding keep/drop (F1 keep, F4 drop).

---
Self-check (Phase 1):
- Перевірено всі 9 пунктів, усі проходять.
- Жодного файлу не створено і не змінено.
- 10 `high`; таблиця одна, відсортована.
- 4 незалежні research-запити.
- 3 blocking-питання, у кожного є default.
- Твердження, які я не перевірив: розташування `verify:l06` (pending R1), детермінізм LLM (pending R3), чи дозволить `pnpm arch` новому модулю імпортувати `adapters/git/diff-parser.ts` (прецедент `diff-loader.ts:3`; дозволено чи це allowlist — не перевіряв).

Ключові файли:
- /Users/harlock/Downloads/Sites/devdigest/server/src/db/schema/eval.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/vendor/shared/contracts/eval-ci.ts
- /Users/harlock/Downloads/Sites/devdigest/client/src/vendor/shared/contracts/eval-ci.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/modules/agents/repository.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/modules/reviews/run-executor.ts
- /Users/harlock/Downloads/Sites/devdigest/reviewer-core/src/review/run.ts
- /Users/harlock/Downloads/Sites/devdigest/reviewer-core/src/grounding.ts
- /Users/harlock/Downloads/Sites/devdigest/client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx
- /Users/harlock/Downloads/Sites/devdigest/client/messages/en/eval.json
- /Users/harlock/Downloads/Sites/devdigest/client/src/vendor/ui/nav.ts

---

## Hand-back 2

Чернетка spec готова: `/Users/harlock/Downloads/Sites/devdigest/specs/08-eval-pipeline.md`, **SPEC-08**, `Status: draft`, `Supersedes: —`. Лінт я не запускав, бо Bash у мене немає. Запусти:
`Run: node .claude/skills/spec-authoring/scripts/lint-spec.mjs specs/08-eval-pipeline.md`

Номер перевірив перед записом: найвищий існуючий — SPEC-07, у модульних `specs/` нових файлів немає.

## Що всередині
- **US-1…US-6:** case з finding; набір case агента; запуск; метрики; історія + Compare; крос-агентний дашборд.
- **AC: 54 (AC-1…AC-54)**, згруповані `###`-підзаголовками:
  - case з finding;
  - набір case;
  - запуск;
  - scoring і метрики;
  - історія та Compare;
  - крос-агентний дашборд.
- **EC: 31**, **NFR: 14**, **UI: 10**, **Q: 4**.
- Ручну процедуру експерименту (prompt A → B → навмисно зламаний, скриншот Compare) я поклав як `### Hand-in procedure` у розділ Goals.
- Там само в Non-goals написано, що копію `specs/eval-pipeline.md` для курсу створює головна сесія після approve.

## Ключові рішення
- **Precision**, як у SPEC-12: `1 − FP ÷ (усі kept findings по оцінених case)`, null коли знаменник 0. Поруч показуються лічильники TP / FP / unlabeled, а для кожної метрики — чисельник і знаменник (AC-31, AC-34, AC-36).
- **Finding, що перекриває і must_find, і must_not_flag.** Finding порівнюється тільки з очікуванням того case, на якому його отримано (AC-29), а в кожного case рівно одне очікування. Тому finding завжди потрапляє рівно в одну категорію: TP, FP або unlabeled.
- **Версія = `agents.version` на старті** плюс snapshot ефективних входів, разом із тілами skills (AC-20). Compare робить diff саме цих snapshot і окремо показує зміни skills (AC-48, AC-49).
- **Заморожений вхід:** diff тільки файлу finding + title, body і номер PR (AC-4). Під час запуску не використовуються repo-intel, контексти, intent і scope filter (AC-22).
- **Дублі case:** повторне створення з того самого finding повертає `409 eval_case_exists` з id наявного case (EC-3). Тут я лишив свій default з intake, а не 200 з SPEC-12.
- **Статуси запуску:** `running`, `completed`, `partial`, `errored`. Case з помилкою не входить у метрики (EC-12, EC-13). Після рестарту сервера завислий запуск стає `errored` з причиною `interrupted` (EC-14). Client перестає опитувати через 10 хв (EC-15).
- **`verify:l06` визначено в NFR-10.** На цій гілці немає жодного `verify:*`, тож шаблону `verify:l03`, на який можна було б спертися, не існує. Склад скрипта взяв з R1.
- **Схема:** NFR-11 вимагає згенеровану міграцію. Яка саме форма (розширений `eval_runs`, як у SPEC-12, чи окрема таблиця), вирішує planner.

## Відкриті питання
- **Q-1** Чи сідити фікстурні eval case? Default: ні — ≥8 case набираються ручною процедурою з реальних рішень, фікстури лише в тестах із `sk_live_xxx`.
- **Q-2** Допуск ±5 рядків при зіставленні? Default: ні, лише строге перекриття.
- **Q-3** Ліміт історії запусків? Default: зберігати все; детальна сторінка показує останні 50, тренд — останні 30.
- **Q-4** Чи показувати в Compare зміну model і strategy? Default: так, по одному рядку над diff промпта.

Q-4 — новий пункт, у вашому списку рішень його не було.

## Self-check (Phase 2)
Всі 12 пунктів проходять. Що перевірив пошуком по файлу:
- кожен з 109 пунктів AC/EC/NFR/UI має рівно одне `(shall)`; помилку з подвійним `(shall)` в EC-1 знайшов і виправив;
- розпливчасті слова з `ears.md` трапляються лише в пунктах Q, а лінт їх там не перевіряє;
- на кожну US-1…US-6 посилається хоча б одна AC.

Все, що залежало від досліджень, тепер спирається на R1–R4. Пунктів зі статусом `pending` не лишилося.

---

## Hand-back 3

Оновив чернетку на місці: `/Users/harlock/Downloads/Sites/devdigest/specs/08-eval-pipeline.md`. Status лишився `draft`, старі ID не змінювались і не перенумеровувались, нові додано в кінець. Лінт не запускав, бо Bash у мене немає — запусти:
`Run: node .claude/skills/spec-authoring/scripts/lint-spec.mjs specs/08-eval-pipeline.md`

## Нові ID

**Нова підсекція `### Read API` (AC-55…AC-61):**
- **AC-55** `GET /agents/:id/eval-cases` — список case агента, найновіші першими, з `latest_result` з останнього завершеного запуску; `null`, якщо case в тому запуску не було.
- **AC-56** `GET /eval-cases/:id` — повний case: заморожений diff, мета PR, очікування; `source` = `{repo_id, pr_number}` або `null`.
- **AC-57** `GET /agents/:id/eval-overview` повертає:
  - `agent`, `cases_total`, `finished_runs`, `running_run_id`;
  - `latest` і `previous` (два найновіші завершені запуски);
  - `trend` — до 30 запусків, хронологічно;
  - `runs` — до 50, найновіші першими.
- **AC-58** `GET /eval-runs/:id` — повний запуск з `case_results` і `progress: {done, total}`. Саме його опитує client.
- **AC-59** `GET /eval-dashboard` — підсумок по кожному агенту та останні 20 запусків воркспейсу.
- **AC-60** `GET /eval-runs/compare?a&b`:
  - для трьох метрик — old, new і delta по спільних case;
  - `cost_usd` кожного запуску цілком;
  - кількість спільних case і case лише в одному із запусків;
  - diff system prompt і зміни skills.
- **AC-61** `GET /pulls/:id/eval-case-links` — мапа finding id → case id, у межах воркспейсу. `FindingRecord` не змінюється.

**Нові EC (EC-32…EC-37):**
- **EC-32** (NQ-1) Перейменування може повторити наявну назву; унікальність діє тільки для автоматично згенерованих назв.
- **EC-33** (NQ-4) Якщо агента видалили під час запуску, запуск зупиняється перед наступним case тихо: без LLM-виклику, без запису результатів, без логу помилки.
- **EC-34** (NQ-5) Compare з незавершеним запуском (`running` / `errored`) повертає `422 run_not_finished`.
- **EC-35** (NQ-6) Порядок перевірок при створенні case: `404` → `finding_undecided` → `agent_missing` → `409 eval_case_exists` → `no_patch` → `range_outside_diff`.
- **EC-36** (NQ-7) Метрика `null` — це розрив у sparkline і trend, а не 0.
- **EC-37** (п.4) Два одночасні `POST /agents/:id/eval-runs` створюють рівно один запуск, другий запит отримує `409`. Як саме це забезпечено на рівні БД — нотатка для реалізації, у spec її не вносив. Очищення завислих запусків при старті вже покриває EC-14.

## Змінені формулювання (ID ті самі)
- **AC-6** (NQ-1) Slug обрізається до 60 символів, суфікс `-2` / `-3` дописується вже після обрізки, порожній slug стає `eval-case`.
- **AC-9** Стан «In eval set» тепер береться з `GET /pulls/:id/eval-case-links`.
- **AC-46** (NQ-3) Картка Cost показує `cost_usd` кожного запуску цілком; метрики рахуються лише по спільних case.
- **NFR-1** Поіменно перелічено всі 7 read-маршрутів, на яких має бути нуль LLM-викликів.
- **NFR-8** (NQ-2) Формула дельти: `round(new·100) − round(old·100)`.
- **NFR-13** Межа 500 мс тепер стосується `GET /eval-dashboard` і `GET /agents/:id/eval-overview`.
- **Inputs and provenance**: новий рядок «Finding → eval case link».

## Self-check (Phase 2)
Всі 12 пунктів пройдено. Перевірив пошуком по файлу:
- лишається 9 розділів `##`, у правильному порядку, `Status: draft`;
- кожен із 122 пунктів AC/EC/NFR/UI має рівно одне `(shall)` (AC 61, EC 37, NFR 14, UI 10);
- у пунктах AC/EC/NFR/UI немає жодного розпливчастого слова;
- нові AC посилаються лише на наявні US-1…US-6;
- кожне рішення NQ-1…NQ-7 і п.1–4 видно в конкретному пункті spec.

Відкриті питання ті самі: Q-1…Q-4.