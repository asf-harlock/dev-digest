## Hand-back 1

## Requirements review: Eval Pipeline (SPEC-08, L06 homework)

### Source
- `/Users/harlock/Downloads/Sites/devdigest/specs/08-eval-pipeline.md` (Spec ID SPEC-08). Статус `draft`. Ви свідомо вирішили планувати з чернетки, тож це не питання.
- Прочитано: root `CLAUDE.md`, `server/CLAUDE.md`, `client/CLAUDE.md`, `reviewer-core/CLAUDE.md`, root/`server`/`client` `INSIGHTS.md`, `.claude/skills/pr-self-review/reference/routing.json`.
- Прочитано код: `server/src/db/schema/{eval,reviews,pulls}.ts`, обидві копії vendor-контрактів, `agents/repository.ts`, `reviews/{run-executor,diff-loader,helpers,findings}.ts`, `platform/{errors,jobs}.ts`, `.dependency-cruiser.cjs`, `reviewer-core/src/{grounding,review/run,review/reduce}.ts`, клієнтські `AgentEditor`, `nav.ts`, `app-shell/helpers.ts`, `messages/en/eval.json`.
- Референс: `upstream/full-functionality` (SPEC-12, `plans/12-eval-pipeline.md`, `server/src/modules/eval/*`). SPEC-15 (skill evals) проігноровано.

### Requirements as given
Усі 54 AC, 31 EC, 14 NFR, 10 UI і 4 Q мають стабільні ID зі specу; я їх не перенумерував. Рядки з однаковим статусом згруповані. Діаграм у specу немає, є лише текстові контракти (маршрути й payload-и в AC).

| # | Requirement (коротко, цитата в specу) | Source | Status | Note |
|---|---|---|---|---|
| AC-1..AC-5, AC-7 | кнопка, `POST /findings/:id/eval-case` без вводу, expectation `must_find`/`must_not_flag` з finding, frozen input, `201` | spec:138-144 | Clear | перевіряється `*.it.test.ts` + hermetic-тестом frozen-input |
| AC-6 | "slug … ≤ 60 символів, суфікс `-2`, `-3`" | spec:143 | Ambiguous (не блокує) | чи входить суфікс у 60; що робити з порожнім slug (кирилична назва); чи може rename створити дубль імені. Дефолти нижче (NQ-1) |
| AC-8, AC-9 | "In eval set" без reload і при рендері PR-сторінки | spec:145-146 | Missing detail (контракт) | `FindingRecord` не має поля, за яким клієнт дізнається, що для finding вже є case. Блокуюче Q1 |
| AC-10, AC-11..AC-18 | вкладка Evals, список, модалка, rename, delete | spec:149-157 | Clear за змістом, але Missing detail за маршрутами | spec називає лише `PATCH/DELETE /eval-cases/:id`; маршрутів списку й читання case немає. Q2 |
| AC-19..AC-26 | `POST /agents/:id/eval-runs` `202`, snapshot, case set, поетапне виконання, polling | spec:160-167 | Clear + дрібний gap | після reload клієнт має дізнатися, що run іде (AC-25) — потрібне поле `running_run_id`. Q2 |
| AC-27..AC-34, AC-38 | скоринг, recall/precision/citation, TP/FP/unlabeled, counts | spec:170-181 | Clear | чисті функції, тестуються без Docker |
| AC-35, AC-41, AC-46, NFR-8 | дельта "в integer points" | spec:178,186,191,246 | Ambiguous (не блокує) | round(new)−round(old) чи round(new−old)? NQ-2 |
| AC-46 | картка Cost "{old} → {new}" | spec:191 | Ambiguous (не блокує) | cost усього run чи лише common cases? NQ-3 |
| AC-36, AC-37, AC-39..AC-45, AC-47..AC-50 | KPI-підписи, per-case таблиця, history, Compare, prompt diff | spec:179-195 | Clear, дані потребують контрактних полів | див. Contract coverage |
| AC-51..AC-54 | пункт sidebar, дашборд агентів, recent runs | spec:198-201 | Conflicting (AC-51) | `nav.ts` лежить у `client/src/vendor/ui/` — це "Do not touch" `*/src/vendor/**`. Дозвіл дано лише для `vendor/shared`. Q3 |
| EC-1..EC-8 | помилки створення case (422/409) | spec:205-212 | Clear | порядок перевірок не заданий, дефолт у NQ-6 |
| EC-9 | "видалення агента видаляє cases і runs в одній операції" | spec:213 | Clear, але є ризик | `eval_cases.owner_id` без FK (`owner_kind` поліморфний), тож каскад робиться в застосунку; run, що виконується в момент видалення, не описаний (NQ-4) |
| EC-10, EC-11, EC-12, EC-13, EC-14 | single-flight 409, 0 cases, errored case, всі errored, reap при boot | spec:214-218 | Clear | single-flight робимо partial unique index, щоб не було гонки |
| EC-15, EC-16 | 10-хв таймаут polling, Retry | spec:219-220 | Clear | клієнтська поведінка |
| EC-17, EC-18, EC-19..EC-24, EC-28..EC-31 | snapshot, незмінність, null-метрики, порожні стани, a11y, workspace 404 | spec:221-235 | Clear | |
| EC-25, EC-26 | compare: різні агенти/workspace, без спільних cases | spec:229-230 | Clear | |
| EC-27 | чекбокс disabled для нефінішованого run | spec:231 | Missing detail | що відповідає сервер на compare з нефінішованим run (NQ-5) |
| NFR-1..NFR-14 | 0 LLM-викликів на скорингу/reads, workspace scope, не писати в reviews/findings/agent_runs, a11y, паритет контрактів, `verify:l06`, міграція через `db:generate`, логування, <500 мс, плейсхолдер-секрети | spec:239-252 | Clear | NFR-2 перевірено: для однофайлового diff `selectMode` завжди `single-pass` (`reviewer-core/src/review/run.ts:134-139`), тобто 1 виклик + ≤2 re-prompts. NFR-10 потребує правки `server/package.json` (bucket `deps`) |
| UI-1..UI-10 | untrusted → sink | spec:280-289 | Clear | |
| Q-1..Q-4 | відкриті питання | spec:293-296 | Clear | лишаю ваші дефолти; причин піднімати їх не знайшов |

### Contract coverage
Поточні `EvalRun` / `EvalCase` / `EvalCaseInput` / `EvalRunRecord` / `EvalDashboard` / `EvalPerTrace` / `EvalRunResult` / `EvalTrendPoint` мають стару форму: `recall: number` без null, `expected_output: unknown`, run = один case. Вони використовуються лише в `server/test/contracts.test.ts:132-147` та в обох `vendor/shared`. Ці shapes треба переписати, а не розширити (див. Recommendation 2).

Обидві eval-регіони копій наразі ідентичні (перевірено `diff`). Решта дрейфу (tour, `AgentManifest`) існує окремо. `client/` рахує `.optional()` замість `.default()`.

| Requirement | Значення (UI/server/DB) | Поле контракту (обидві копії) | Тип | Зберігається в | Gap |
|---|---|---|---|---|---|
| AC-2/3/5 | expectation | `EvalExpectation` | `{type:'must_find'\|'must_not_flag', file, start_line, end_line, severity?, category?, title?}` | `eval_cases.expected_output` jsonb | ні (поле є, форму треба типізувати) |
| AC-4/14 | frozen diff, PR title/body/number/repo | `EvalCaseMeta` `{pr_number, repo_full_name, title, body}` + `input_diff` | string / object | `eval_cases.input_diff`, `input_meta` | ні |
| AC-7/EC-3 | source finding id | `EvalCase.source_finding_id` | `string\|null` | `eval_cases.source_finding_id` (НОВА колонка + unique index) | так, міграція |
| AC-11 | сортування "newest first" | `EvalCase.created_at` | ISO string | `eval_cases.created_at` (НОВА) | так, міграція (`updated_at` для rename — теж) |
| AC-8/AC-9 | "In eval set" на finding | `FindingRecord.eval_case_id` | `string\|null` (nullish у client) | join `eval_cases.source_finding_id` | так → Q1 |
| EC-8/AC-14 | посилання на source PR або "Source no longer available" | `EvalCase.source` `{repo_id, pr_number}\|null`, обчислюється live із join | object\|null | не зберігається | так → Q2 (нове поле) |
| AC-12/AC-37 | per-case result | `EvalCaseOutcome` `{case_id, name, expectation_type, status:'scored'\|'errored', pass:boolean\|null, error_reason, expected_count, got_count, findings:[{file,start_line,end_line,title,severity,category,label:'tp'\|'fp'\|'unlabeled'}], grounding_kept, grounding_total, duration_ms, cost_usd}` | object | `eval_runs.case_results` jsonb (НОВА) | так, міграція. Назва case береться з `case_set` (EC-18) |
| AC-20 | snapshot конфігу | `EvalRunSnapshot` `{provider, model, strategy, system_prompt, skills:[{name, body}]}` | object | `eval_runs.snapshot` jsonb (НОВА) | так, міграція |
| AC-21 | case set | `case_set: [{id, name}]` | array | `eval_runs.case_set` jsonb (НОВА) | так, міграція |
| AC-24/EC-13 | статус run | `EvalRunStatus` | `'running'\|'completed'\|'partial'\|'errored'` | `eval_runs.status` (НОВА) | так. У upstream немає `partial`, у нашому specу є |
| AC-20 | версія агента | `agent_version` | int | `eval_runs.agent_version` (НОВА) | так, міграція |
| AC-24/33/34 | метрики + чисельники/знаменники | `EvalMetrics` `{recall,precision,citation_accuracy: {value:number\|null, num:int, den:int}, tp, fp, unlabeled, traces_passed, traces_total, cases_errored}` | object | ratios: колонки `recall/precision/citation_accuracy/traces_*/cases_errored` (частина вже є); `num/den/tp/fp/unlabeled`: jsonb `metric_parts` (НОВА) | так, міграція |
| AC-24/EC-14 | finished_at, error_reason, `interrupted` | `finished_at`, `error_reason` | string\|null | `eval_runs.finished_at`, `error_reason` (НОВІ) | так, міграція |
| EC-21/AC-46 | cost, duration | `cost_usd`, `duration_ms` | number\|null | є (`eval_runs.cost_usd`, `duration_ms`) | ні |
| NFR-3 | workspace scope | — | uuid | `eval_runs.workspace_id` (НОВА, NOT NULL) | так, міграція |
| AC-25/AC-26 | "Running case k of n" | `progress {done,total}` | ints | виводиться з `len(case_results)` / `len(case_set)` | ні (виводиться) |
| AC-25 після reload | чи іде run для агента | `running_run_id` в overview | string\|null | запит на `status='running'` | так → Q2 |
| AC-35/36/41 | latest + previous finished run | `EvalOverview.latest`, `.previous` | `EvalRunRecord\|null` | запит | так → Q2 (немає маршруту) |
| AC-42/43/53 | trend ≤30, sparkline 10, recent 50/20 | `EvalTrendPoint {run_id, ran_at, agent_version, recall, precision, citation_accuracy}` (метрики nullable) | array | запит по `eval_runs` | так → Q2 |
| AC-46..50, Q-4 | compare | `EvalCompare {old, new, common_count, only_old, only_new, deltas{recall,precision,citation_accuracy: number\|null}, cost_delta, prompt_diff:[{kind:'added'\|'removed'\|'context', text}], skills_diff{added,removed,changed}, model_changed:{from,to}\|null, strategy_changed:{from,to}\|null}` | object | обчислюється; дані зі `snapshot` + `case_results` | так → Q2 (нова відповідь) |
| AC-53 / EC-28 | "disabled" бейдж, model badge | `EvalAgentSummary {agent_id, agent_name, model, enabled, latest, trend}` | object | `agents.enabled`, `agents.model` | ні, лише нова форма |
| EC-1/2/3/4/5/10/11/25/30 | коди помилок | `AppError(code, status, details)`; id наявного case/run у `details` | — | — | ні. Перевірено: `AppError` має `details` (`platform/errors.ts`); client-ом читається через `ApiError`. Підтвердити в тесті |

### Clarifying questions

Блокуючі:
1. [AC-8, AC-9] Як PR-сторінка дізнається, що для finding уже є case? Пропоную додати `eval_case_id: string | null` у `FindingRecord` (обидві копії `review-api.ts`; у client `.nullish()`), заповнювати його в `findingRowToDto` через left join `eval_cases.source_finding_id`. Це змінює існуючий review-контракт і `reviews` repo/mapper. Альтернатива: окремий `GET /pulls/:id/eval-case-links` (finding_id → case_id), без зміни `FindingRecord`, але дві мережеві залежності на сторінці. Що обираєте? Від відповіді залежать контракти і файли reviews-модуля.
2. [AC-10..AC-14, AC-25, AC-35, AC-39..AC-43, NFR-13] Spec називає лише 7 маршрутів. Для екранів не вистачає читальних маршрутів. Пропоную додати (назви у стилі specу, без `/eval/…` префіксу):
   - `GET /agents/:id/eval-cases` — список case з `latest_result` (з останнього finished run);
   - `GET /eval-cases/:id` — повний case (frozen diff, meta, `source`) для модалки;
   - `GET /agents/:id/eval-overview` — `{agent, cases_total, finished_runs, running_run_id, latest, previous, trend(≤30), runs(≤50)}`; одним запитом живить KPI вкладки Evals і detail-сторінку;
   - `GET /eval-runs/:id` — повний run з `case_results` і `progress` (його ж поллить клієнт);
   - `GET /eval-dashboard` і `GET /eval-runs/compare?a&b` — як у specу, з формами з таблиці вище.
   Чи затверджуєте ці маршрути та форми? Якщо хочете інші назви чи форми — скажіть зараз, бо вони входять у перший (контрактний) крок.
3. [AC-51] Пункт sidebar **Eval Dashboard** додається у `client/src/vendor/ui/nav.ts` (`SKILLS LAB`, після Conventions). Файл під "Do not touch" `*/src/vendor/**`. `client/INSIGHTS.md` (запис 2026-09-20) каже, що `nav.ts` — plain data для розширення, а `activeKeyFor` уже має гілку `/eval` → `"eval"`. Ваш явний дозвіл покриває лише `vendor/shared`. Чи дозволяєте правити `nav.ts` (один рядок)? Це також потребує ключа `eval` з `gKey` або без нього — вирішу в плані.

Не блокують (беру дефолт, якщо не заперечите):
- NQ-1 [AC-6]: slug ≤60 символів, суфікс додається поверх (до 66, у межах 80 для rename); порожній slug → `eval-case`; rename на вже існуюче ім'я дозволено (унікальність лише для автогенерації, результати прив'язані до `case_id`).
- NQ-2 [AC-35/41/46, NFR-8]: дельта = різниця округлених відсотків (`round(new·100) − round(old·100)`), щоб показані числа завжди зходилися.
- NQ-3 [AC-46]: картка Cost показує `cost_usd` усього run-а (не лише common cases); рахунок "common cases" стосується лише ratio-карток.
- NQ-4 [EC-9]: якщо агента видалили, поки його run виконується, executor бачить, що рядок run зник, і тихо зупиняється (без помилки в лог на рівні error).
- NQ-5 [EC-27]: сервер на `compare` з нефінішованим run відповідає `422 run_not_finished`.
- NQ-6 [EC-1..EC-5]: порядок перевірок при створенні case — `404` (workspace) → `finding_undecided` → `agent_missing` → `eval_case_exists` (409) → `no_patch` → `range_outside_diff`.
- NQ-7 [AC-41/42/53, EC-19]: `null`-метрика у sparkline/trend пропускається (розрив лінії), а не малюється як 0.

### Recommendations
1. **Міграція: розширити `eval_runs` на місці (не нова таблиця).**
   - Що змінює: `eval_runs` отримує `workspace_id`, `owner_id` (id агента), `status`, `agent_version`, `snapshot`, `case_set`, `case_results`, `metric_parts`, `traces_*`, `cases_errored`, `finished_at`, `error_reason`. Колонки `case_id`, `actual_output`, `pass` видаляються. `eval_cases` отримує `source_finding_id` (unique index), `created_at`, `updated_at`; `input_diff` стає NOT NULL.
   - Додатково: partial unique index на `eval_runs(owner_id) WHERE status='running'` — він закриває гонку подвійного кліку краще за check-then-insert (EC-10).
   - Чому: spec говорить про `eval_runs` як про таблицю runs (NFR-3, EC-9); немає мертвої таблиці з оманливою назвою; шлях перевірений upstream. Жоден код не пише в ці таблиці (Grep `evalCases|evalRuns` поза `db/schema*` порожній), тож NOT NULL без default безпечний.
   - Ціна: `drizzle-kit generate` питає інтерактивно "створено чи перейменовано", коли в одній таблиці одночасно є add і drop. Upstream обійшов це двома проходами: pass 1 лише додає, pass 2 лише видаляє; обидва запускаються як `pnpm db:generate < /dev/null` (`plans/12-eval-pipeline.md:145-150`). Отже будуть дві нові міграції, без правок існуючих.
   - Альтернатива: окрема `eval_suite_runs` (один адитивний прохід, без prompt-ів), але стара `eval_runs` лишається мертвою, а імена контрактів сперечаються. Рекомендую розширення.
2. **Переписати eval-контракти на місці в обох копіях і оновити `server/test/contracts.test.ts:132-147`.** Старий `EvalRun` має `recall: number` (не nullable), що суперечить EC-19; нові shapes треба типізувати повністю (таблиця вище). Parity-тест порівнює лише eval-регіони обох копій (не весь файл), бо `tour` і `AgentManifest` уже дрейфують.
3. **`no-cross-module-import` (`.dependency-cruiser.cjs`) не дає eval-модулю імпортувати `reviews/*`.** Тому:
   - eval-репозиторій читає `findings/reviews/pull_requests/pr_files/agents` напряму з db (правило цього не забороняє, `repository.ts` дозволений);
   - агентів і skills бере через `container.agentsRepo` (`getById`, `enabledSkillsForPrompt`);
   - формат skill-блоку (`### {name}\n{body}`, `run-executor.ts:266`) виносить у `modules/_shared/skill-render.ts`, а `run-executor.ts` починає його імпортувати (мінімальний рефакторинг, існуючі тести покриті), щоб eval і live review не розійшлися;
   - окремий task line без автора (автор не заморожується, AC-4): константа в `eval/constants.ts`, не `taskLine` з `reviews/helpers.ts`.
   - Ціна: одна дрібна правка `reviews/run-executor.ts`. Альтернатива — дублювати рядок і ризикувати дрейфом.
4. **Не використовувати `sliceDiff` з reviewer-core для frozen diff.** Він шукає файл через `includes`, а при промаху повертає або весь `raw`, або лише заголовки без hunks — це ламає AC-4 ("лише цей файл, усі hunks"). Пишу точний сплітер за `+++ b/<path>` у `eval/frozen-input.ts`. `reviewer-core` не чіпаю. Перевірка діапазону (EC-5/EC-6) — через `groundFindings` (повторне використання, а не друге визначення "валідної цитати").
5. **Виконувати run як detached promise (як `POST /pulls/:id/review`), не через `JobRunner`.** `JobRunner` має timeout 120 с і 2 retries (`platform/jobs.ts:41-42`): ретрай перезапустив би LLM-виклики і зламав би NFR-2. Reap зависших `running` run-ів — поруч із наявним reaper-ом у `app.ts:70-84` (EC-14).
6. **Каскад EC-9:** `AgentsService.delete` викликає порт `evalCleanup` (з `container`), який видаляє cases і runs агента перед видаленням самого агента, бажано в одній транзакції. Ціна: порт у container і невелика правка agents-модуля.
7. **Тест, що ловить регресію:** парні тести `executor` — два прогони одного case дають байт-ідентичний prompt і жодної секції repo-intel/project/PR-context/intent (NFR-10). Окремий тест: eval-run не пише в `reviews/findings/agent_runs/run_traces` (NFR-4).

### Execution mode
Рекомендація: **multi-agent**, контракти першими. Є три незалежні потоки, що зустрічаються на фіксованих контрактах і маршрутах: server-модуль, клієнт PR-сторінки/Evals-вкладки, клієнт dashboard-сторінок. Попередження з `INSIGHTS.md` (2026-10-02): контрактний крок, що називає shape без полів, породжує другий прохід. Тому у Phase 2 план перерахує всі поля контрактів і маршрутів (з таблиці вище, після ваших відповідей на Q1/Q2), і W1 завершить їх до старту решти. Попередньо:
- W1: контракти в обох `vendor/shared` (один коміт) + `db/schema/eval.ts` + дві згенеровані міграції;
- W2: `server/src/modules/eval/**` + правки reviews (`eval_case_id`, `_shared/skill-render`) + agents cascade + reap + `verify:l06`;
- W3: клієнт — PR-сторінка (кнопка), Evals-вкладка, `lib/hooks/eval.ts`, `messages/en/{eval,prReview}.json`; W3 ∥ W2;
- W4: клієнт — `/eval`, `/eval/agents/[agentId]`, Compare, nav; ∥ W2/W3 (спільні файли `lib/hooks/eval.ts` і `eval.json` віддам W3 як власнику, W4 імпортує — або злиємо W3+W4, якщо це зручніше);
- тести (`test-writer`) → `architecture-reviewer ∥ security-reviewer ∥ plan-verifier`.

Single-agent теж можливий (один `implementer` по кроках 1..N), але тоді значно довше й один контекст перегружений. Рішення за вами.

Не входить у план (за вашою вказівкою): копія `specs/eval-pipeline.md`.

Чекаю відповідей на Q1, Q2, Q3 і вибір режиму виконання (а також вашого погодження/відхилення Recommendations 1-7 та NQ-1..NQ-7), після чого напишу Implementation Plan.

---

## Hand-back 2

## Implementation Plan: Eval Pipeline (SPEC-08)

### Objective
Дати автору агента змогу перетворити прийняте або відхилене finding на eval case (AC-1..AC-9, EC-1..EC-8), побачити набір cases на вкладці Evals (AC-10..AC-18), запустити агента на заморожених входах у фоні (AC-19..AC-26, EC-10..EC-18), отримати детерміновані метрики без LLM (AC-27..AC-38, EC-19..EC-21, NFR-1) та переглядати історію, Compare і міжагентний Eval Dashboard (AC-39..AC-54). Верифікується `pnpm verify:l06` (NFR-10). Вимоги не переписую, ID беруться зі `specs/08-eval-pipeline.md`.

### Decisions from Phase 1
- [Q1 / AC-8, AC-9] → окремий маршрут `GET /pulls/:id/eval-case-links` (у проєкті pull адресується UUID `:id`: `GET /pulls/:id/context`, `/pulls/:id/reviews`, `server/README.md:130`; форма збережена). `FindingRecord` і `review-api.ts` не чіпаємо. Відповідь: `EvalCaseLinks {links: [{finding_id, case_id, agent_id}]}`. Масив записів (а не map) вибрано, бо `agent_id` потрібен для deep link на вкладку Evals (AC-8).
- [Q2 / AC-10..14, AC-25, AC-35, AC-39..43, NFR-13] → схвалено 6 читальних маршрутів з формами з Contract coverage (нижче в кроці 1).
- [Q3 / AC-51] → явний дозвіл на однорядкову правку `client/src/vendor/ui/nav.ts`.
- Vendor/shared обох копій → дозволено явно (один коміт).
- Recommendation 1 (widen `eval_runs` на місці, два проходи `pnpm db:generate < /dev/null`, partial unique index для single-flight) → accepted.
- Recommendation 2 (переписати eval-контракти в обох копіях, оновити `server/test/contracts.test.ts`) → accepted.
- Recommendation 3 (eval читає db напряму; `modules/_shared/skill-render.ts` виноситься і використовується `run-executor.ts`) → accepted.
- Recommendation 4 (власний сплітер frozen diff + `groundFindings`, без `sliceDiff`) → accepted.
- Recommendation 5 (detached promise, не `JobRunner`; reap поруч з наявним) → accepted.
- Recommendation 6 (`evalCleanup` для каскаду EC-9 в одній транзакції) → accepted.
- Recommendation 7 (тест ідентичності prompt і тест "нічого не пишеться в reviews/findings/agent_runs/run_traces") → accepted.
- NQ-1..NQ-7 → дефолти accepted: slug ≤60 + суфікс поверх, порожній slug → `eval-case`, дубль імені при rename дозволено; delta = `round(new·100) − round(old·100)`; Cost = `cost_usd` усього run; видалення агента посеред run → executor тихо зупиняється; compare з нефінішованим run → `422 run_not_finished`; порядок перевірок створення case `404 → finding_undecided → agent_missing → eval_case_exists → no_patch → range_outside_diff`; null-метрика у sparkline/trend — розрив, не 0.
- Execution mode → multi-agent. Власність спільних файлів W3/W4: окремий воркстрим W1b "client scaffold" володіє `lib/hooks/eval.ts`, `lib/eval-format.ts` і всіма `client/messages/en/*.json`; W3 і W4 лише імпортують і ключі не додають. Обґрунтування: злиття W3+W4 дало б ~40 файлів в одного агента й втратило б паралельність, а W1b невеликий і детермінований (hooks, форматери, повний перелік рядків specу). W1b ∥ W2, бо залежить лише від контрактів.
- Не в плані: копія `specs/eval-pipeline.md` (робить основна сесія).

### Modules affected
- `server/` — контракти (vendor), схема + 2 міграції, новий `modules/eval/`, правки `agents`, `reviews/run-executor.ts`, `_shared`, `platform/container.ts`, `app.ts`, `modules/index.ts`, `package.json`, тести.
- `client/` — контракти (vendor), hooks/форматери/i18n, FindingCard на PR-сторінці, вкладка Evals, сторінки `/eval` і `/eval/agents/[agentId]`, `nav.ts`.
- `reviewer-core/`, `e2e/`, `mcp/` — не змінюються (`reviewer-core` читає серверну копію контрактів, потрібні тільки існуючі `reviewPullRequest`, `groundFindings`).

### Constraints
- `CLAUDE.md` (root): `@devdigest/shared` існує у двох копіях, зміна контракту = обидві в одному коміті; `*/src/vendor/**` не чіпати без явного запиту (дозволено лише `vendor/shared` обох копій і `nav.ts`); `server/src/db/migrations/**` не редагувати, лише `pnpm db:generate`; lockfile не чіпати; завжди scope через `getContext()`; zod може бути завантажений двічі, не покладатися на `instanceof z.ZodError`.
- `server/CLAUDE.md`: модулі реєструються статично в `src/modules/index.ts`; шари `routes.ts` (HTTP) → `service.ts` (логіка) → `repository.ts` (уся персистентність) → `helpers.ts` (чисті перетворення) → `constants.ts` (усі літерали); у service немає raw SQL; Zod-схема route керує валідацією і серіалізацією (`schema.params/body/querystring/response`, без ручного `.parse`); кожен handler починається з `getContext(container, req)`; залежності лише з `container`, без конкретних адаптерів; `process.env` заборонено. Перед додаванням таблиці/колонки прочитати `server/docs/db-schema.md`.
- `server/.dependency-cruiser.cjs`: `no-cross-module-import` (eval не імпортує `reviews/*`, `agents/*`, лише `_shared/*` і db); `orm-only-in-repository`; `pure-helpers-stay-pure` для `helpers.ts`; не додавати нові записи в `ORM_DEBT`.
- `server/CLAUDE.md` Gotchas: `POST /pulls/:id/review` fire-and-forget, `buildApp()` awaits reap зависших runs і це коректно лише для одного інстансу API; `server/INSIGHTS.md` (Codebase Patterns 2026-10-06): `pnpm arch` не ловить імпорт адаптера з `modules/`, перевіряти вручну.
- `server/test`: `*.it.test.ts` потребують Docker і самі скіпаються через `dockerAvailable()` (`server/test/helpers/pg.ts`), решта hermetic.
- `client/CLAUDE.md`: компонент = папка `<Name>/{<Name>.tsx,<Name>.test.tsx,styles.ts,constants.ts,helpers.ts,index.ts}`; feature-компоненти в `app/<route>/_components/` (PascalCase папки), спільні в `src/components/` (kebab-case); `fetch` у компоненті заборонено (лише hook у `src/lib/hooks/*` через `lib/api.ts`); нові endpoints = нові hooks; текст лише через `next-intl`; помилки гілкувати за `ApiError.status`; `pnpm arch` забороняє route → `_components` іншого route, shared → route.
- `client/INSIGHTS.md` (What Doesn't Work 2026-09-24): `useMutation().isPending` на fire-and-forget не loading-стан; потрібен poll до зміни стану (`lib/hooks/intent.ts` як зразок); не піднімати другий глобальний toast, коли QueryCache вже показав помилку (`intent.ts:51-54,110-117`).
- `client/INSIGHTS.md` (Decisions/Patterns 2026-09-20): `nav.ts` — plain data, `activeKeyFor` у `app-shell/helpers.ts` уже має гілку `/eval` → `"eval"`.
- Root `INSIGHTS.md` (What Doesn't Work 2026-10-02): контрактний крок, що не перелічує всі поля, породжує другий прохід. Тому крок 1 нижче перелічує всі поля; W2/W3/W4 не стартують, доки W1 не завершений.
- `reviewer-core/CLAUDE.md`: ZERO I/O, `INJECTION_GUARD` єдина точка захисту, зовнішній текст у prompt тільки через `wrapUntrusted()`; eval-шлях не обходить `reviewPullRequest`.
- `routing.json`: `*/src/vendor/shared/contracts/` = bucket `contracts`; `client/src/vendor/ui/nav.ts` = bucket `vendor`; `server/package.json` = `deps`.

### Skills the implementer will apply
| Path / area | Bucket (routing.json) | Skills |
|---|---|---|
| `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `client/src/vendor/shared/contracts/{knowledge,eval-ci}.ts` | contracts | zod, typescript-expert |
| `server/src/db/schema/eval.ts` | db-schema | drizzle-orm-patterns, postgresql-table-design, onion-architecture |
| `server/src/db/migrations/**` (лише згенеровані) | db-migrations | drizzle-orm-patterns, postgresql-table-design |
| `server/src/modules/eval/**`, `modules/agents/**`, `modules/reviews/run-executor.ts`, `modules/_shared/skill-render.ts`, `modules/index.ts`, `platform/container.ts`, `app.ts`, `server/test/**` | backend | onion-architecture, fastify-best-practices, zod, security, typescript-expert |
| `server/src/modules/eval/repository.ts`, `server/src/modules/agents/repository.ts` (умовно, `repository`/`/db/`) | backend + conditional | + drizzle-orm-patterns |
| `server/package.json` | deps | security |
| `client/src/app/**`, `client/src/components/**`, `client/src/lib/**`, `client/messages/**` | frontend | frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert |
| `client/**/*.test.tsx` | frontend + conditional | + react-testing-library |
| `client/src/vendor/ui/nav.ts` | vendor | (немає) |

### Step-by-step plan
Крок 1 (контракти) у W1: усі поля нижче обов'язкові; обидві копії змінюються в одному коміті. Регіон `// ---- Eval ----` у `knowledge.ts` і блок "Eval" у `eval-ci.ts` змінюються, решта файлів (tour, `AgentManifest`, що вже дрейфують) не чіпається. Дефолтів у нових shapes немає, тому `.default()` ↔ `.optional()` розбіжностей не виникає (NFR-9).

1. **[server + client]** Переписати eval-контракти в обох `vendor/shared` (NFR-9, CONTRACT:Eval*). Файли: `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `client/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`. Поля:
   - `EvalOwnerKind` (як є, `'skill'|'agent'`), `EvalExpectationType = 'must_find'|'must_not_flag'`.
   - `EvalExpectation {type, file, start_line:int, end_line:int, severity?:string|null, category?:string|null, title?:string|null}` (display-поля scoring не читає, AC-5).
   - `EvalCaseMeta {pr_number:int, repo_full_name:string, title:string, body:string|null}` (AC-4).
   - `EvalCaseSource {repo_id:string, pr_number:int}` (EC-8).
   - `EvalFindingLabel = 'tp'|'fp'|'unlabeled'`; `EvalActualFinding {file, start_line, end_line, title, severity:string, category:string, label}` (AC-29, AC-37; лише validated/grounded/redacted findings, UI-4).
   - `EvalCaseOutcome {case_id, name, expectation_type, status:'scored'|'errored', pass:boolean|null, error_reason:string|null, expected_count:int|null, got_count:int|null, findings:EvalActualFinding[], grounding_kept:int, grounding_total:int, duration_ms:int, cost_usd:number|null}`; `pass`, `expected_count`, `got_count` = null рівно коли `status='errored'` (AC-12, AC-23, EC-12).
   - `EvalCase {id, owner_kind, owner_id, name, input_diff, input_meta:EvalCaseMeta, expectation:EvalExpectation, source_finding_id:string|null, notes:string|null, created_at, updated_at}` (AC-7, AC-14).
   - `EvalCaseLatestResult {run_id, state:'passed'|'failed'|'errored', expected_count:int|null, got_count:int|null, duration_ms:int|null, cost_usd:number|null, error_reason:string|null}` (AC-12); "never run" = `null`, а не окреме значення.
   - `EvalCaseListItem {id, name, expectation:EvalExpectation, created_at, latest_result:EvalCaseLatestResult|null}` (AC-11); `EvalCaseDetail = EvalCase.extend({source:EvalCaseSource|null, latest_result:EvalCaseLatestResult|null})` (AC-14, EC-8).
   - `EvalCaseRename {name:string.min(1).max(80)}` (AC-15, EC-30, UI-7).
   - `EvalCaseLinks {links:[{finding_id, case_id, agent_id}]}` (AC-8, AC-9).
   - `EvalRunStatus = 'running'|'completed'|'partial'|'errored'` (AC-24, EC-13, EC-14, AC-38).
   - `EvalRunSnapshot {provider:Provider, model, strategy:'auto'|'single-pass'|'map-reduce', system_prompt, skills:[{name, body}]}` (AC-20); `EvalCaseRef {id, name}` (AC-21, EC-18).
   - `EvalRatio {value:number|null, num:int, den:int}`; `EvalMetrics {recall, precision, citation_accuracy:EvalRatio, tp:int, fp:int, unlabeled:int, traces_passed:int, traces_total:int, cases_errored:int}` (AC-30..34, EC-19).
   - `EvalRunRecord {id, agent_id, agent_name:string|null, status, started_at, finished_at:string|null, agent_version:int, cases_total:int, cases_done:int, metrics:EvalMetrics|null, duration_ms:int|null, cost_usd:number|null, error_reason:string|null}` (AC-25 `progress` виводиться з `cases_done`/`cases_total`; `metrics` null при `running` і EC-13).
   - `EvalRunDetail = EvalRunRecord.extend({snapshot:EvalRunSnapshot, case_set:EvalCaseRef[], case_results:EvalCaseOutcome[]})` (AC-37).
   - `EvalRunStart {id, status:'running'}` (AC-19).
   - `EvalTrendPoint {run_id, ran_at, agent_version:int, recall:number|null, precision:number|null, citation_accuracy:number|null}` (AC-41, AC-42).
   - `EvalOverview {agent:{id, name, model, enabled:boolean}, cases_total:int, finished_runs:int, running_run_id:string|null, latest:EvalRunRecord|null, previous:EvalRunRecord|null, trend:EvalTrendPoint[] (≤30, хронологічно), runs:EvalRunRecord[] (≤50, новіші першими)}` (AC-25, AC-35, AC-40..43).
   - `EvalAgentSummary {agent_id, agent_name, model, enabled:boolean, cases_total:int, latest:EvalRunRecord|null, sparkline:(number|null)[] (recall, ≤10, хронологічно)}`; `EvalDashboard {agents:EvalAgentSummary[], recent_runs:EvalRunRecord[] (≤20)}` (AC-53, AC-54, EC-28).
   - `EvalCompareQuery {a:uuid, b:uuid}`; `EvalCompareRatios {recall, precision, citation_accuracy: number|null}`; `EvalCompare {old:EvalRunRecord, new:EvalRunRecord, common_cases:int, only_old:int, only_new:int, common:{old:EvalCompareRatios, new:EvalCompareRatios}, prompt_diff:[{kind:'added'|'removed'|'context', text}], prompt_changed:boolean, skills_diff:{added:string[], removed:string[], changed:string[]}, model_change:{from,to}|null, strategy_change:{from,to}|null}` (AC-45..50, EC-26, Q-4); `old` = run з раннім `started_at`. Server дельт не повертає: delta рахується лише клієнтським форматером (NQ-2).
   - Видалити старі `EvalRun`, `EvalPerTrace`, `EvalCaseInput`, `EvalRunResult`, `EvalDashboard` (стара форма), `EvalTrendPoint` (стара форма) з `knowledge.ts`/`eval-ci.ts`. Використання: лише `server/test/contracts.test.ts` та `index.ts` re-exports (перевірено Grep). `PluginEvalCase` у `productionize.ts` не чіпати.
2. **[server]** Оновити `server/test/contracts.test.ts`: замінити парс старого `EvalRun` (рядки ~132-147) парсами нових контрактів (валідні й невалідні приклади, nullable `value`, `pass:null` при errored, усі 4 статуси). Це "contract parse tests" з NFR-10; файл належить W1 і лишається зеленим після кроку 1 (NFR-10, CONTRACT:Eval*).
3. **[server]** Схема `eval_cases`/`eval_runs` у `server/src/db/schema/eval.ts`, **проход 1 (лише додавання)**, потім `cd server && pnpm db:generate < /dev/null` (NFR-11, NFR-3, EC-9, EC-10, AC-7). `eval_cases`: додати `source_finding_id uuid` (без FK: case переживає finding/review/PR, EC-8; unique index `eval_cases_source_finding_uq` на це поле, NULL-и дозволені), `created_at`/`updated_at timestamptz default now() NOT NULL`, індекс `(workspace_id, owner_kind, owner_id)`; `input_diff` → NOT NULL; `input_meta`/`expected_output` → NOT NULL з `$type<>`. `eval_runs`: додати `workspace_id uuid NOT NULL → workspaces (cascade)`, `agent_id uuid NOT NULL` (без FK; skill evals non-goal, тому `agent_id`, а не `owner_*`), `status text enum('running','completed','partial','errored') NOT NULL default 'running'`, `agent_version int NOT NULL`, `snapshot jsonb NOT NULL`, `case_set jsonb NOT NULL`, `case_results jsonb NOT NULL default '[]'`, `metric_parts jsonb` (tp/fp/unlabeled + num/den), `traces_passed int`, `traces_total int`, `cases_errored int NOT NULL default 0`, `finished_at timestamptz`, `error_reason text`; індекс `(workspace_id, agent_id, ran_at desc)`; partial unique index `eval_runs_one_running_uq` на `(agent_id) WHERE status = 'running'` (EC-10). Колонки `recall`, `precision`, `citation_accuracy`, `duration_ms`, `cost_usd`, `ran_at` (= start time) лишаються. Старі `case_id`, `actual_output`, `pass` ще залишаються в цьому проході.
4. **[server]** Схема, **проход 2 (лише видалення)**: прибрати з `eval_runs` `case_id` (FK), `actual_output`, `pass`, знову `pnpm db:generate < /dev/null` (NFR-11). Підсумок: рівно дві нові міграції, жодної правки існуючої (`server/src/db/migrations/**` тільки створюються генератором). Якщо генератор все одно запитує про rename, зупинитись і доповісти (проходи злито). Додати/оновити `server/src/db/rows.ts` типами `EvalCaseRow`/`EvalRunRow` (за патерном файла).
5. **[server]** Винести формат skill-блоку з `run-executor.ts:266` (`### {name}\n{body}`) в `server/src/modules/_shared/skill-render.ts` (`renderSkillBlock`) і замінити там `blocks = skills.map(...)` на імпорт; поведінка live review не змінюється, наявні `run-executor-*.test.ts` лишаються зеленими (AC-22, UI-1; Recommendation 3). Touches `server/src/modules/_shared/skill-render.ts`, `server/src/modules/reviews/run-executor.ts`.
6. **[server]** Створити `modules/eval/constants.ts`, `helpers.ts` і чисті модулі: `scoring.ts`, `frozen-input.ts`, `prompt-diff.ts`, `skills-diff.ts` (AC-27..34, AC-46..50, EC-19, EC-26, NQ-1, NQ-7).
   - `constants.ts`: коди помилок (`finding_undecided`, `agent_missing`, `eval_case_exists`, `no_patch`, `range_outside_diff`, `no_eval_cases`, `eval_run_in_progress`, `runs_not_comparable`, `run_not_finished`), ліміти (name 80, slug 60, trend 30, runs 50, dashboard 20, sparkline 10), `EVAL_TASK_LINE` без автора (автор не заморожується), `INTERRUPTED_REASON='interrupted'`.
   - `scoring.ts` (без I/O): `matches` (однакові `file` + строге інклюзивне перетинання діапазонів, без ±5), `scoreCase`, `scoreRun` (recall, precision = 1 − FP/kept, citation = Σkept/Σ(kept+dropped), traces_*, `cases_errored`, null при знаменнику 0, errored виключаються), `scoreCommon` (ті самі формули на common cases для Compare).
   - `frozen-input.ts`: точний сплітер raw diff за `diff --git`/`+++ b/<path>` (не `sliceDiff`: нечіткий `includes` + fallback на весь diff ламає AC-4), перевірка діапазону через `groundFindings` (EC-5), full-file kinds `secret_leak|lethal_trifecta|phantom|hook` вимагають лише наявності файлу (EC-6), порожній/бінарний patch → `no_patch` (EC-4).
   - `helpers.ts`: slug (UI-6/NQ-1), `-2`/`-3` суфікс, дефолтна назва `eval-case`.
   - `prompt-diff.ts`: рядковий diff системних prompt (AC-48, AC-50); `skills-diff.ts`: added/removed/changed за ім'ям, порядком або тілом (AC-49).
7. **[server]** `modules/eval/repository.ts` (уся персистентність, лише через db, scoped за `workspace_id`, NFR-3, EC-31, UI-10): створення case з перевіркою одного case на finding (unique index → `eval_case_exists` з id існуючого), read finding → review → pull → repo (контекст створення), `pr_files` для fallback; списки cases з останнім finished run агента; `eval_runs` insert (partial unique index → `eval_run_in_progress` з id), оновлення per-case результатів, finalize, reap (`status='running'` → `errored`, `error_reason='interrupted'`, EC-14), вибірки overview/dashboard/compare. Запити списків не читають `case_results`/`snapshot` jsonb, вони потрібні лише в detail/compare (NFR-13). `deleteByAgent(workspaceId, agentId, tx?)` для EC-9. `eval-case-links` для PR (`findings` ⨝ `reviews.pr_id` ⨝ `eval_cases.source_finding_id`).
8. **[server]** `modules/eval/executor.ts`: для одного case — `parseUnifiedDiff(input_diff)`, `reviewPullRequest({systemPrompt, model, diff, llm, strategy, skills:[renderSkillBlock...], prDescription: body, task: EVAL_TASK_LINE + frozen title})` без repo-intel/project context/PR context/intent/out-of-scope (AC-22, UI-1, UI-2, NFR-2, NFR-4). Нуль файлів у diff → errored (EC-12). Повертає kept findings, grounding kept/total, `costUsd` (може бути null), тривалість, `assembly` (для тесту ідентичності prompt).
9. **[server]** `modules/eval/service.ts`: (a) `createFromFinding` — порядок перевірок з NQ-6, побудова frozen diff з `container.git.diff(...)` з fallback на `pr_files` (як `reviews/diff-loader`, без імпорту з нього), expectation `{type, file, start_line, end_line, severity, category, title}`, 201 `EvalCase` (AC-2..AC-7, EC-1..EC-6, EC-7: тип не змінюється при зміні рішення); (b) `rename`/`delete` (AC-15..AC-18, EC-30; удалення case не чіпає результати минулих runs завдяки `case_set`/`case_results`); (c) `startRun` — snapshot агента (`provider/model/strategy/system_prompt`) + `agentsRepo.enabledSkillsForPrompt(agent.id)` (імена й тіла в порядку), `agent_version`, `case_set`, зчитування frozen inputs усіх cases до старту (EC-17, EC-18), `422 no_eval_cases`, `409 eval_run_in_progress`, відповідь `202 {id, status:'running'}` до першого case; виконання detached promise (не `JobRunner`: його timeout 120 с і 2 retries зламали б NFR-2), cases по одному, `container.llm(provider)` на snapshot, помилка провайдера/ключа → case `errored` (EC-12), агента видалено посеред run → тиха зупинка (NQ-4), фіналізація `completed`/`partial`/`errored` (AC-24, EC-13), `cost_usd = null`, якщо будь-який scored case без вартості (EC-21), лог старту/завершення без diff/body/prompt/finding-тексту (NFR-12); (d) `getRun`, `overview`, `cases`, `caseDetail` (з `source` у EC-8), `dashboard`, `compare` (EC-25, EC-26, NQ-5), `links`; (e) `reapStaleRuns()`. Жодних записів у `reviews`, `findings`, `agent_runs`, `agent_run_skills`, `run_traces`, `pull_requests.last_reviewed_sha` (NFR-4); жодних LLM-викликів у read/CRUD/scoring (NFR-1).
10. **[server]** `modules/eval/routes.ts` (Zod `schema.params/body/querystring/response` з контрактів кроку 1; кожен handler починається з `getContext`; `409`/`422` з `details`: id наявного case/run):
    - `POST /findings/:id/eval-case` → 201 `EvalCase`
    - `GET /pulls/:id/eval-case-links` → `EvalCaseLinks`
    - `GET /agents/:id/eval-cases` → `EvalCaseListItem[]`
    - `GET /eval-cases/:id` → `EvalCaseDetail`; `PATCH /eval-cases/:id` (body `EvalCaseRename`) → `EvalCase`; `DELETE /eval-cases/:id` → 204
    - `POST /agents/:id/eval-runs` → 202 `EvalRunStart`
    - `GET /agents/:id/eval-overview` → `EvalOverview`
    - `GET /eval-runs/compare?a&b` → `EvalCompare` (реєструвати перед `/eval-runs/:id`)
    - `GET /eval-runs/:id` → `EvalRunDetail`
    - `GET /eval-dashboard` → `EvalDashboard`
    Id-параметри валідуються як UUID (`422`), чужий workspace → `404` (AC-19, EC-31, UI-10). Додати `eval` в `server/src/modules/index.ts`.
11. **[server]** Каскад EC-9: `AgentsRepository.deleteById` приймає необов'язковий `beforeDelete(tx)` і виконується в `db.transaction`; `AgentsService.delete` передає `tx => container.evalRepo.deleteByAgent(workspaceId, id, tx)`; у `platform/container.ts` додати getter `evalRepo` за зразком `agentsRepo`/`reviewRepo` (EC-9). Touches `server/src/modules/agents/{service,repository}.ts`, `server/src/platform/container.ts`.
12. **[server]** Reap при boot: у `server/src/app.ts` поруч із `ReviewService(container).reapStaleRuns()` додати awaited `EvalService(container).reapStaleRuns()` з тим самим try/catch non-fatal і логом (EC-14).
13. **[server]** Додати `"verify:l06"` у `server/package.json`: `vitest run src/modules/eval/scoring.test.ts src/modules/eval/frozen-input.test.ts src/modules/eval/executor.test.ts test/eval-contract-parity.test.ts test/contracts.test.ts test/eval.it.test.ts` (NFR-10). Імена файлів зафіксовані тут, їх створює W5. Лише рядок scripts, lockfile не чіпати.
14. **[client]** W1b scaffold: `client/src/lib/hooks/eval.ts` з hooks `useAgentEvalCases`, `useEvalCase`, `useRenameEvalCase`, `useDeleteEvalCase`, `useCreateEvalCaseFromFinding` (409 `eval_case_exists` → успішний стан "In eval set" з id з `details`, інші коди гілкуються за `ApiError.status`/`code`), `usePullEvalCaseLinks(pullId)`, `useAgentEvalOverview`, `useStartEvalRun`, `useEvalRun(id)` (poll за зразком `useIntentClassification`: без `isPending` як loading, зупинка при виході зі `running`, 10-хв таймаут → EC-15, помилка poll → зупинка + `retry()`, без другого toast → EC-16, інвалідація overview/cases/dashboard по завершенню → AC-26), `useEvalDashboard`, `useEvalCompare(a,b)`; типи лише з `@devdigest/shared` (NFR-9). Touches `client/src/lib/hooks/eval.ts`; дописати в `client/src/lib/hooks/index.ts` лише якщо це відповідає патерну файла (доменні hooks імпортуються напряму).
15. **[client]** W1b: `client/src/lib/eval-format.ts` (+ `eval-format.test.ts` пише W6): `formatPercent` (ціле %, `null` → "—", NFR-8, EC-19), `formatDeltaPoints` (`round(new·100) − round(old·100)`, підпис ▲/▼, `null` → "—", EC-20, NQ-2), `formatCostUsd` (`null` → "—", два знаки, EC-21), `formatDuration`. Усі користувацькі рядки specу в `client/messages/en/eval.json` (розширити існуючий namespace `eval`, staged-ключі не видаляти: dashboard, evalsTab, caseModal, compare, runDetail, states, errors, aria-live тексти, tooltips EC-1/EC-2/EC-11, порожні стани EC-22..EC-24, `disabled` бейдж EC-28), `client/messages/en/prReview.json` (кнопка Turn into eval case, In eval set, tooltips, помилки EC-4/EC-5), `client/messages/en/agents.json` (`editor.tabs.evals`) (NFR-6, AC-1, AC-10, AC-12, AC-35, AC-52).
16. **[client]** W3: вкладка Evals у Agent editor (AC-10, AC-11..AC-18, AC-19, AC-25, AC-26, AC-35, AC-36, AC-39, EC-11, EC-15, EC-16, EC-22, EC-23, EC-29, NFR-7). Додати таб `evals` після `context` у `AgentEditor/constants.ts`, гілку в `AgentEditor.tsx`; нова папка `AgentEditor/_components/EvalsTab/` (компонентні папки за конвенцією): заголовок "Eval cases" + "{passed} / {scored} passing", 4 KPI-картки через `vendor/ui/charts/MetricCard` (Recall/Precision/Citation у %, Traces passed `{n}/{m}`, дельти, підписи TP/FP/unlabeled і "{passed} of {scored} must-find cases"), список cases (іконка + текст стану, "expected {n}, got {m}", truncate + `title`), модалка case (diff view escaped plain text, UI-3; PR title/body, expectation, посилання на source PR або "Source no longer available", останній результат з тривалістю і вартістю, rename+Save), діалог підтвердження видалення з назвою case, кнопка **Run all evals** (disabled при `running_run_id` або 0 cases, "Running case {k} of {n}", `aria-live="polite"` регіон), посилання "View full dashboard →".
17. **[client]** W3: PR-сторінка (AC-1, AC-8, AC-9, EC-1, EC-2, EC-4, EC-5). Правки `app/repos/[repoId]/pulls/[number]/_components/FindingCard/**` (кнопка з іконкою `FlaskConical` після Accept/Dismiss, стани: активна / disabled з tooltip EC-1 або EC-2 / "In eval set" з посиланням на `/agents/:agentId?tab=evals`, без reload) і плюмбінг у `FindingsPanel`/`FindingsTab` (джерело стану: `usePullEvalCaseLinks(pull.id)` + `review.agent_id` проти списку агентів для EC-2; помилки `no_patch`/`range_outside_diff` показують рядки з `prReview.json`).
18. **[client]** W3: UI-5/UI-3 для текстів моделі: назви findings як escaped text; жодного HTML/Markdown у diff view (NFR-7: фокус, контраст, цілі ≥24×24). Якщо в `src/components/` немає придатного diff view, додати `src/components/diff-view/` (kebab-case, повна папкова структура).
19. **[client]** W4: Eval Dashboard (AC-51..AC-54, EC-24, EC-28, EC-29). `client/src/vendor/ui/nav.ts`: один рядок `{ key: "eval", label: "Eval Dashboard", icon: …, href: "/eval" }` у `SKILLS LAB` після Conventions (явний дозвіл; `activeKeyFor` уже повертає `"eval"`, активний і на `/eval/agents/*`). `app/eval/page.tsx` (тонка) + `app/eval/_components/EvalDashboardView/**`: заголовок і підзаголовок, картки агентів (ім'я, model badge, `disabled` бейдж, "Last run v{n} · {ran at} · {passed}/{total} pass", sparkline через `vendor/ui/charts/Sparkline`, Recall/Prec/Cite, chevron), таблиця Recent eval runs · all agents (20, клік рядка → detail агента).
20. **[client]** W4: detail агента (AC-39..AC-50, EC-20, EC-23, EC-25..EC-27, EC-29). `app/eval/agents/[agentId]/page.tsx` + `_components/EvalAgentDetailView/**`: breadcrumb `Skills Lab > Eval Dashboard > {agent}`, All agents, ім'я + model badge, "{finished runs} runs on the {cases}-case set", dropdown агентів, **Run eval**; 3 KPI-картки з дельтою і sparkline (10); **Metric trend** через `vendor/ui/charts/LineChart` (30 runs, підписи `v{version}`, null → розрив); таблиця Recent runs (50; checkbox, `v{n}`, три метрики як `BarRow` + %, pass, cost, status; checkbox disabled для нефінішованих з tooltip EC-27; "2 selected" + **Compare** при рівно двох); клік по рядку відкриває модалку run detail з per-case результатами (AC-37, UI-5); **Compare** модалка "Compare runs · v{old} → v{new}": 4 картки (Recall/Precision/Citation у %, Cost) з дельтами, рядок "{n} common cases · {a} only in v{old} · {b} only in v{new}", EC-26 повідомлення, рядки model/strategy (Q-4), **System prompt diff** (`−`/`+` з v-мітками, escaped monospace, UI-8) або "System prompt unchanged", перелік skills added/removed/changed.
21. **[server]** W5 тести (NFR-1, NFR-2, NFR-4, NFR-10, NFR-13, NFR-14): `src/modules/eval/scoring.test.ts` (AC-27..34, усі нульові знаменники EC-19, errored виключено EC-12), `frozen-input.test.ts` (діапазон має перетинати hunk, full-file kinds, точний сплітер, `no_patch`), `executor.test.ts` (два прогони одного case дають байт-ідентичний prompt без секцій repo-intel/project-context/PR-context/intent; mock provider; UI-1/UI-2), `prompt-diff.test.ts`, `skills-diff.test.ts`, `helpers.test.ts` (slug, суфікс, fallback), `test/eval-contract-parity.test.ts` (порівнює лише eval-регіони обох копій), `test/eval.it.test.ts` (скіп без Docker; маршрути; один case на finding → 409; single-flight 409 при гонці; workspace scoping 404; нуль LLM-викликів на read/CRUD/скорингу; run не пише в `reviews/findings/agent_runs/agent_run_skills/run_traces`; каскад при видаленні агента; reap `interrupted`; compare 422/404; фікстури лише з плейсхолдер-секретами `sk_live_xxx`; перформанс overview/dashboard на 10 агентів × 50 runs × 50 cases із щедрим порогом 500 мс). Перевірити `server/test/routes-smoke.test.ts` на потребу оновлення переліку маршрутів.
22. **[client]** W6 тести (`*.test.tsx`/`*.test.ts` поруч із компонентами за конвенцією, `react-testing-library`): `eval-format.test.ts`, `FindingCard.test.tsx` (стани кнопки, disabled-tooltip, "In eval set"), Evals tab (стани cases, KPI, run polling, aria-live, empty state), dashboard і detail (порожні стани, вибір 2 runs, Compare, disabled чекбокс), polling hook (таймаут 10 хв, retry). a11y: ролі, aria-live, ≥24×24 (NFR-7).

### Execution
Multi-agent. W1 повністю завершується (контракти обох копій, схема, обидві міграції, `contracts.test.ts`) до старту інших, щоб W2/W1b/W3/W4 працювали з фіксованими полями.

| Workstream | Agent | Steps | Files owned | Depends on | Parallel with |
|---|---|---|---|---|---|
| W1 contracts + db | implementer | 1–4 | `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `client/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `server/test/contracts.test.ts`, `server/src/db/schema/eval.ts`, `server/src/db/rows.ts`, `server/src/db/migrations/**` (нові, згенеровані) | — | — |
| W2 backend | implementer | 5–13 | `server/src/modules/eval/**` (без тестів), `server/src/modules/_shared/skill-render.ts`, `server/src/modules/reviews/run-executor.ts`, `server/src/modules/agents/{service,repository}.ts`, `server/src/modules/index.ts`, `server/src/platform/container.ts`, `server/src/app.ts`, `server/package.json` | W1 | W1b |
| W1b client scaffold | implementer | 14–15 | `client/src/lib/hooks/eval.ts`, `client/src/lib/eval-format.ts`, `client/messages/en/{eval,prReview,agents}.json` | W1 | W2 |
| W3 client: PR page + Evals tab | implementer | 16–18 | `client/src/app/agents/[id]/_components/AgentEditor/**` (крім тестів), `client/src/app/repos/[repoId]/pulls/[number]/_components/{FindingCard,FindingsPanel,FindingsTab}/**` (крім тестів), `client/src/components/diff-view/**` (за потреби) | W1b | W2, W4 |
| W4 client: dashboard + detail | implementer | 19–20 | `client/src/app/eval/**` (крім тестів), `client/src/vendor/ui/nav.ts` | W1b | W2, W3 |
| W5 server tests | test-writer | 21 | `server/src/modules/eval/*.test.ts`, `server/test/eval-contract-parity.test.ts`, `server/test/eval.it.test.ts`, `server/test/routes-smoke.test.ts` (за потреби) | W2 | W6 |
| W6 client tests | test-writer | 22 | усі нові `*.test.ts(x)` у `client/src/**` | W1b, W3, W4 | W5 |
| Review | architecture-reviewer ∥ security-reviewer ∥ plan-verifier | — | read-only | W5, W6 | one another |

Жоден файл не входить у два воркстріми. `server/package.json` (`verify:l06`) належить W2 і посилається на файли з W5: до завершення W5 скрипт не запускати, перший запуск лише після W5. Окремі файли `*.test.ts` у `src/modules/eval/` належать W5, а не W2, навіть якщо лежать поруч.

### Test plan
- `cd /Users/harlock/Downloads/Sites/devdigest/server && pnpm typecheck` — ловить розбіжності контрактів і виклики старих `Eval*` shapes.
- `cd server && pnpm lint` — `process.env` ban, hooks.
- `cd server && pnpm arch` — `no-cross-module-import` (eval не імпортує `reviews/agents`), `orm-only-in-repository`, `pure-helpers-stay-pure`, відсутність циклів через `container`; плюс ручна перевірка, що адаптери не імпортують `modules/` (`server/INSIGHTS.md` 2026-10-06).
- `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` — hermetic: scoring, frozen-input, executor, prompt-diff, skills-diff, helpers, parity, contracts, наявні `run-executor-*.test.ts` (регрес step 5).
- `cd server && pnpm verify:l06` — повний гейт NFR-10 (DB-частина сама скіпається без Docker).
- `cd server && pnpm exec vitest run .it.test` — з Docker: `eval.it.test.ts` + наявні `agents-*.it.test.ts` (регрес каскаду/транзакції видалення агента) і `reviews.it.test.ts`.
- `cd /Users/harlock/Downloads/Sites/devdigest/client && pnpm typecheck` — типи контрактів у hooks і компонентах.
- `cd client && pnpm lint` — заборона `fetch` у компонентах, hook-правила.
- `cd client && pnpm arch` — route не лізе в чужий `_components`, shared не імпортує route.
- `cd client && pnpm test` — компонентні тести, форматери, polling hook.
- `reviewer-core`, `e2e`, `mcp` — гейти не потрібні (код не змінюється).

### Risks / open questions
- **Spec `draft` застарів**: `specs/08-eval-pipeline.md` не описує доданих читальних маршрутів (`GET /agents/:id/eval-cases`, `GET /eval-cases/:id`, `GET /agents/:id/eval-overview`, `GET /eval-runs/:id`, `GET /eval-dashboard` вже є, `GET /eval-runs/compare`) і `GET /pulls/:id/eval-case-links`, а також резолюцій NQ-1..NQ-7. Оновлення належить `spec-creator` (draft редагується на місці).
- **Do-not-touch, потрібне підтвердження виконано**: `vendor/shared` обох копій і `nav.ts` дозволені явно; міграції лише через `pnpm db:generate` (дві нові, жодної правки існуючої); `server/package.json` змінюється лише рядком scripts, lockfile не чіпається.
- **Міграція**: pass 1 додає NOT NULL-колонки в `eval_runs` без default. Це безпечно лише для порожньої таблиці (жоден код не пише в `eval_runs`/`eval_cases`, перевірено Grep), але на чужій dev-БД з ручно вставленими рядками `db:migrate` впаде. Якщо `db:generate < /dev/null` знову питає про rename, проходи злито, треба зупинитись.
- **AC-37 vs AC-54**: AC-54 каже, що клік по рядку dashboard відкриває detail агента, AC-37 каже, що run відкривається "з будь-якої таблиці runs". Прийнято: на dashboard рядок веде на detail агента, на detail рядок відкриває модалку per-case результатів. Підтвердити при перегляді.
- **AC-49**: "changed" у skills_diff = змінено тіло або позицію серед спільних імен (окремого списку `reordered` немає); підтвердити, що цього достатньо.
- **EC-9 транзакція**: `AgentsRepository.deleteById` отримує transaction-обгортку; наявні agents-тести, що мокають `deleteById`, може знадобитись оновити (у рамках W2).
- **`run_not_finished`** (NQ-5) і `partial` (нема в upstream) додані як нові коди/статус; клієнтський `ApiError` має віддавати `details.case_id`/`details.run_id` для 409. Підтвердити в it-тесті.
- **Агент видалений посеред run** (NQ-4): тиха зупинка лишає run у БД? Ні: каскад EC-9 видаляє його рядок у тій самій транзакції; executor, побачивши відсутній рядок, просто виходить.
- **Q-1** лишається "no seed": ≥8 cases створюються вручну за hand-in procedure, seed і fixtures в БД не додаються (фікстури лише в тестах).
- **Hand-in procedure** (скриншот Compare і числа в PR) ручна, поза кодом.
- **`input_files`** в `eval_cases` лишається nullable і зберігає `[file]` (колонка існує, контракт її не віддає).
- **Назви run-ів у `eval_runs.agent_id`** без FK: каскад лише програмний (крок 11). Дані невидимо осиротіють, якщо агента видалити поза `AgentsService.delete`.