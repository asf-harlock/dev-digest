## Hand-back 1

## Spec intake: Eval case modal, per-case Run і редизайн Evals-табів

Нічого не створено й не змінено. Усі 4 макети прочитані.

### Framing
Автор агента або скіла хоче перевіряти один кейс за раз і бачити результат одразу в модалці. Для цього кнопка «Turn into eval case» на PR-сторінці має відкривати Case Editor із даними finding (замість миттєвого створення), а власника кейса (агент чи скіл) обирають у модалці. Evals-таби треба перебудувати під макет 4, а модалку виправити під макети 1–3 без налізань footer і без другого скролбара. «Done» для користувача: finding → модалка → Save (або Run on save) → рядок у списку з результатом без перезавантаження. Окремої кнопки «Turn into skill eval case» на PR-сторінці більше немає.

### Placement
Кілька модулів (client, server, обидві копії shared) → `specs/10-eval-case-editor-run.md`, SPEC-10 · Supersedes: — (перелік перевизначених пунктів SPEC-08/09 буде в Goals, як у SPEC-09; див. Q5)

### Insights read
Прочитано `client/INSIGHTS.md`, `server/INSIGHTS.md` і кореневий `INSIGHTS.md` (фіча кросмодульна, змінює shared). Релевантні записи:
- client: `src/components/**` не може мати `_components/`; `FindingsPanel.test` падає на новому hook-модулі без mock; один глобальний toast на помилку.
- server: усі читання `eval_runs` мають фільтр `owner_kind='agent'` (дисципліна, не тип); POST без тіла парсять вручну; валідація дає 422; LLM-виклик не скасувати.
- root: `.nullish()` для jsonb; обидві vendor-копії міняються в одному коміті.
`reviewer-core/`, `e2e/`, `mcp/` пропущено: не торкаємось.

### Sources read
| Джерело | Що взято |
|---|---|
| Макети 1–3 (модалка) | Двоколонний layout, банер POSITIVE/NEGATIVE, вкладки Diff/Files/PR meta, Expected JSON (`[]` для негативного), Actual output, банер результату, footer. Баги: банер/footer лягають на контент (2), другий скролбар (2, 3). |
| Макет 4 (таб агента) | KPI (RECALL, PRECISION, CITATION ACCURACY, TRACES PASSED) під заголовком EVAL METRICS і підписом «Scoring is mechanical…»; «5/6 passing · 6 cases»; рядки з Run / Edit / кошиком. **KPI показує «1/1», а список «5/6»** — див. F1. |
| `specs/08`, `specs/09` | Non-goals, які перевизначаємо: SPEC-08 «per-case run, Run case, Run on save, JSON editor»; SPEC-09 «per-row ▷ run (Q-9)». |
| `client/src/components/eval-case-editor/*`, `EvalsTab` (agent/skill), `FindingCard`, `eval-case-row` | Поточна реалізація. |
| `server/src/modules/eval/{routes,service,repository,executor}.ts`, `db/schema/eval.ts`, `vendor/shared/contracts/{knowledge,eval-ci}.ts` | Контракти, single-flight, виконання одного кейса. |
| `client/src/vendor/ui/kit/Modal.tsx` | Footer у слоті поза скролом; тіло — один `overflow:auto`, без фіксованої висоти. |

### Constraints
- Кейс зі сповіщення — не міняти vendor: `Modal` (`vendor/ui`) read-only; layout чиниться в `EditorModal` — `client/CLAUDE.md`.
- Обидві vendor-копії shared міняти в одному коміті — root `CLAUDE.md`, `INSIGHTS.md` (контракти `EvalCaseLatestResult`, `EvalExpectationInput` тощо).
- Міграції лише `pnpm db:generate`, add-column і drop-column окремими проходами — `server/INSIGHTS.md` (0020/0021).
- `verify:l06` існує і перелічує файли — `server/package.json:17`; зелений має лишитись, нові тести додати до списку.
- Нуль LLM-викликів у читаннях і скорері; Run case — єдиний платний шлях (SPEC-09 NFR-1, NFR-2).
- Перша колонка/кнопки/мітки тільки через `client/messages/en/eval.json` і `prReview.json`; `fetch` лише у хуках.

### Gap vs макети
| Елемент макета | Є зараз? | Gap |
|---|---|---|
| Header «New eval case» + підзаголовок «Seeded from an accepted finding · assert the expected output» | Заголовок так (`EditorModal.tsx:142-150`), підзаголовка немає | Додати `subtitle` (accepted/dismissed/manual — різні тексти) |
| Двоколонний layout | Ні: одна колонка `s.body` (`styles.ts:5`), поля стопкою | Новий layout, дві колонки |
| Банер POSITIVE/NEGATIVE + «MUST find "<title>" at file:line» | Ні | Новий; для manual — від `type` |
| Name * | Так | Дефолт «From finding: …» ≠ слаг AC-6 (F11) |
| Вкладки Diff / Files / PR meta | Ні, усе одним списком | Змінити структуру; що таке «Files» — у макеті невідомо |
| Expected output JSON + «valid JSON» + «+ Finding skeleton» | Ні (поля file/lines/type) | Нова модель вводу (F2) |
| Actual output + «Never run yet» | Ні | Потрібні kept findings останнього run (F12) |
| Банер «Last run failed/passed · 0/1 · 6.4s · $0.00» | Ні | Потрібен також стан errored/running; `$0.00` vs null cost (F12) |
| Footer: Run on save, Cancel, Run case, Save | Лише Cancel/Save/Delete | Нові перемикач і кнопка |
| Вибір власника (agent/skill) | Є лише на skill-меню в PR | Нове в модалці (F7) |
| KPI-рядок + «Scoring is mechanical…» + «View full dashboard →» | KPI і лінк є; підпис інший | Перестилізація; дельти/підписи/тренд (F15) |
| «Eval cases 5/6 passing 6 cases», Run all, primary New | Порядок і primary інші, «N cases» немає | Дрібна правка |
| Рядок: іконка статусу, бейдж MUST FIND/NOT FLAG, «expected N finding, got M · recall X%», тег праворуч, Run, Edit, кошик | Є назва, статус-текст, тип, location, tag, edit, trash | Немає Run, «recall X%», бейджа біля назви |
| Skill-таб «як агентський» | Є lift-рядок і trend, KPI немає | Визначити (F15, Q6) |

### Findings
| ID | Pri | Lens | Finding | Evidence | Proposal |
|---|---|---|---|---|---|
| F1 | high | Cross-module | Run одного кейса як `eval_runs` без розділення зіпсує KPI/тренд/історію/dashboard/compare, а список кейсів перестане бачити результати інших кейсів: `listCases` бере outcomes лише з **останнього** finished-run (`service.ts:282-291`, `326-329`; `repository.ts:726-737`, `753-768`). Макет 4 показує саме цей симптом (KPI 1/1, список 5/6). pending R1 (повний перелік читачів) | макет 4; service.ts; repository.ts | Persist у `eval_runs` з колонкою `scope` ('set'\|'case', default 'set', одна add-column міграція). Усі читання агентських run фільтрують `scope='set'`, окрім delete. «Останній результат кейса» читати як останній за всіма run, що містили кейс |
| F2 | high | Missing state | JSON-редактор vs модель: кейс має **один** `EvalExpectation` (`knowledge.ts:179-187`); макет 3 показує негативний кейс як `[]` без файла й рядків, а скорер для `must_not_flag` потребує file+діапазон (AC-28). `EvalExpectationInput` не має `title` (`knowledge.ts:259-271`), а JSON його містить. SPEC-09 Q-8 відхилила «expect nothing». pending R2 (як зроблено upstream) | макети 1, 3; knowledge.ts | Q1 |
| F3 | high | Corner case | Макет показує редагований Diff/Expected для finding-кейса, але SPEC-09 EC-6/EC-7 блокує вхід після створення (`service.ts:346-347`), а replace-правило видаляє старий кейс, тоді як unique index `(source_finding_id, owner_kind, owner_id)` (`eval.ts:53-57`) не дозволить дубль | макети 1–3; SPEC-09 EC-6/7 | Q3: редагувати вхід лише в модалці до першого Save; після збереження блок лишається |
| F4 | high | Missing state | «Run case» у макеті 2 працює в модалці **нового** (незбереженого) кейса. Run по збереженому кейсу не дає результату для чернетки | макет 2 | За замовчуванням Run case активний лише для збереженого й чистого кейса; для нового/зміненого — підказка + «Run on save» (Q2) |
| F5 | high | UX | Корінь layout-багів: `Modal` має одну прокручувану зону `{flex:1; overflow:auto}` без висоти (`Modal.tsx:60`), `s.body` без фіксованої висоти (`styles.ts:5`), textarea мають власний скрол. У макеті 2 footer-банер накладається на контент, в 2–3 з'являється другий скролбар | Modal.tsx:60-65; макети 2, 3 | Банер результату — у footer-слоті над кнопками; тіло фіксованої висоти з двома колонками; скролбари лише на textarea, жодного на тілі/колонці. Vendor не чіпати (Q7) |
| F6 | high | Cross-module | Клієнт не має frozen diff finding. Потрібен читальний `GET /findings/:id/eval-case-draft` (seed: назва, expectation, frozen diff, meta, власники), що ранньо дає 422 (`no_patch`, `range_outside_diff`, `finding_undecided`) без LLM. Save — існуючі POST finding-роути з необов'язковим тілом `EvalCaseInput` (парсити вручну; `server/INSIGHTS.md` 2026-09-20; AC-2 «no further input» змінюється) | service.ts:102-115, 165-195; routes.ts:57-96 | Додати draft-роут; тіло optional; без тіла поведінка SPEC-08 як зараз |
| F7 | high | Missing state | Одна кнопка і вибір власника: `caseLinks` повертає лише агентські кейси (`repository.ts:488`); `evalButtonState` вимикає кнопку при видаленому агенті (`helpers.ts:26-35`, EC-2), хоча скіли могли б бути власниками | repository.ts:470-491; helpers.ts | Draft-відповідь повертає `owners: [{kind,id,name,has_case,case_id}]`; кнопка «In eval set» лише коли всі доступні власники мають кейс; агент видалено → лишається вибір скілів; власник із кейсом — disabled з посиланням |
| F8 | high | Cross-module | Run case для skill-кейса = дві рецензії (with/without) у carrier-агенті (NFR-2 SPEC-09, `service.ts:554-625`): потрібен carrier, вартість ×2, результат — with-skill стан + effect | service.ts:554-625; SPEC-09 AC-20 | Q4: ті ж carrier-діалог і два плечі; Actual output = with-skill; banner додає effect |
| F9 | high | Corner case | Single-flight: індекс «один running на агента/скіла» (`eval.ts:115-120`) вже буде блокувати Run case під час Run all і навпаки; нема правила для двох Run case одночасно | eval.ts:111-120; SPEC-08 EC-10/37 | Q9: один running run на власника будь-якого `scope`; `409 eval_run_in_progress`; усі Run-кнопки disabled, поки йде run; polling `GET /eval-runs/:id` |
| F10 | high | Cross-module | Видалення `SkillEvalMenu` зачіпає: проп `skillEval` у `FindingCard`/`FindingsPanel`, `prReview.skillEval.*`, тести й `i18n-key-coverage.test`, mock у `FindingsPanel.test` (client INSIGHTS 2026-10-11). Сервер-роути `eval-skills` і `skill-eval-case` лишаються — їх використовує модалка. pending R3 | FindingCard.tsx:25,129; SkillEvalMenu.tsx | Видалити компонент, ключі й тести в тому ж змінному наборі; перелічити в плані |
| F11 | med | UX | Дефолтна назва «From finding: …» (макет) ≠ слаг (SPEC-08 AC-6, UI-6) | макет 1; SPEC-08 AC-6 | Для модалки сід «From finding: {title}» ≤80, редагований; POST без тіла — слаг (Q8) |
| F12 | med | Missing state | «Actual output» потребує kept findings у `EvalCaseLatestResult` (його немає, `knowledge.ts:225-233`) → додати `findings` (`.nullish()`, обидві копії); cost `null` показувати «—», не `$0.00` (SPEC-08 EC-21) | knowledge.ts:225; макети 2, 3 | Розширити контракт; банер: failed/passed/errored/running |
| F13 | med | UX | Статус у рядку тільки іконкою (макет 4) порушує NFR-8 (текст, не лише колір) | макет 4; SPEC-09 NFR-8 | Іконка + sr-only/`aria-label`; банер `role="status"` |
| F14 | med | Missing state | «got M» у рядку, «recall X%» для `must_not_flag` (макет 4: «recall 100%» на NOT FLAG), «0 finding» (множина) | макет 4; SPEC-08 EC-19 | «recall» лише для `must_find`; ICU plural; «got» = перетини з очікуванням, як AC-12 |
| F15 | med | Missing state | Макет 4 прибирає дельти, підписи KPI й тренд, які вимагають SPEC-08 AC-35/36 і SPEC-09 AC-55; skill-таб не має KPI | EvalsTab.tsx:62-65; макет 4 | Q6 |
| F16 | med | Untrusted | Невалідний JSON, ключі поза білим списком (`__proto__`), розмір, нормалізація для dirty (форматування ≠ зміна) | макети 1–3 | `JSON.parse` + whitelist полів + Zod на сервері; Save disabled з inline-текстом; кап розміру |
| F17 | med | Corner case | Закриття модалки під час run: LLM не скасувати, run іде далі; повторне відкриття показує «running»; після replace-правки новий `case_id` — банер старого кейса скинути, Run on save запускати по `replaced_from_id`-результату | server INSIGHTS 2026-09-30; service.ts:363-386 | Закриття не скасовує; банер знімається при replace |
| F18 | med | Corner case | Run on save при відхиленому Save (422/5xx): run не стартує, стан перемикача лишається | EditorModal.tsx:92-111 | Run лише після `kind:"saved"` |
| F19 | med | Missing state | Вкладка «Files» у макеті не описана | макет 1 | Список файлів diff (read-only), вибір `file` |
| F20 | low | UX | Polling/timeout single-case: 10 хв (`EVAL_RUN_TIMEOUT_MS`) надмірно; глобальний toast уже є | eval.ts:378 | Коротший таймаут, один toast |
| F21 | low | Test | `e2e/specs/` без eval-флоу; `verify:l06` не покриває нові файли | e2e grep; server/package.json:17 | Додати нові тести в список; e2e-флоу — окремий пункт |
| F22 | low | UX | ≤768px: двоколонник стекається; вкладки `role=tablist`, перемикач `role=switch` | макет 1 | Описати як NFR |

### Approaches (персистенція single-case run)
| Option | What | Touches | Size | Risk |
|---|---|---|---|---|
| A | Ефемерний run (синхронно, без запису) | server route, client | S | Результат зникає після перезавантаження; іконка рядка не оновиться; немає reap/single-flight |
| B | Рядок `eval_runs` із `scope='case'` | 1 add-column міграція, repo-фільтри, обидва shared | M | Треба фільтрувати ВСІ читання (F1); інакше KPI/тренд брешуть |
| C | Нова таблиця `eval_case_runs` | міграція, repo, reaper, polling | L | Дублює plumbing |

Recommendation: B — береться: executor, single-flight, reap на старті, polling, snapshot версії агента. Обрати C, якщо R1 покаже забагато читачів `eval_runs`.

### Research requests
| ID | Question | Scope | Where to look | Unblocks |
|---|---|---|---|---|
| R1 | Які читачі `eval_runs`/`latestFinishedRunRow`/`caseResults` на сервері та які клієнтські споживачі `EvalOverview.latest/trend/runs`, dashboard, compare, `passingCounts` вважатимуть run із `scope='case'` повним run? Дати список `file:line` | repo | `server/src/modules/eval/{repository,service,helpers}.ts`, `modules/agents`, `modules/skills`, `client/src/lib/hooks/eval*.ts`, `client/src/app/eval/**`, EvalsTab обох | F1, Q2 |
| R2 | Чи є в `upstream/full-functionality` реалізація «Run case»/«Run on save»/«Actual output»/Expected JSON (`[]` для негативного)? Якщо так — ендпоінт, персистенція, семантика `[]` та рахунку «got» | both (git) | `git log -S 'Run on save' --all`, `git grep -n "Actual output" upstream/full-functionality`, `specs/12-eval-pipeline.md` там | F2, F4, Q1, Q2 |
| R3 | Точний перелік усього, що зникає/змінюється при видаленні `SkillEvalMenu` і пропа `skillEval`: компоненти, ключі `prReview.skillEval.*`, тести, `i18n-key-coverage`, і чи `useFindingSkills`/`useCreateSkillCaseFromFinding` потрібні десь іще | repo | `client/src/app/repos/**/FindingCard`, `FindingsPanel`, `client/src/lib/hooks/skill-eval.ts`, `client/messages/en/prReview.json`, `client/src/test/i18n-key-coverage.test.ts` | F10 |

### Questions for the user
Blocking:
- **Q1** Семантика Expected output JSON. A) масив з 1 елемента — дзеркало поточного `EvalExpectation` (негативний кейс показує заборонене розташування); B) як у макеті: `[]` = «жодного finding у diff» (нова гілка скорингу, `file` стає необов'язковим у контракті, перевизначає SPEC-08 AC-28 і SPEC-09 Q-8); C) N очікувань на кейс. Default: A. pending R2.
- **Q2** Run case і персистенція: B (`scope` у `eval_runs`), Run case активний лише для збереженого чистого кейса, інакше «Run on save». Альтернатива — ефемерний dry-run чернетки (A). Default: B + disabled для чернетки. pending R1.
- **Q3** Finding-кейс: вхід (diff, Expected) редагований лише в модалці до першого Save, після Save блок EC-6/EC-7 лишається. Default: так.

Non-blocking:
- **Q4** Run case для skill-кейса = обидва плечі в carrier (діалог carrier-а з SPEC-09, вартість ×2). Default: так.
- **Q5** `Supersedes:` = `—` + перелік перевизначених пунктів у Goals (SPEC-09 Q-5). Перевизначаємо: SPEC-08 Non-goal (per-case run, Run case, Run on save, JSON editor), AC-2/AC-3 («no further input»), AC-8, EC-2; SPEC-09 Non-goal Q-9, AC-48…AC-53 і UI-частину EC-35/36/37/44, AC-1/AC-43 (порядок кнопок), EC-6/7 (лише до першого Save). Default: так.
- **Q6** Лишити дельти, підписи KPI й тренд; skill-таб отримує KPI with-skill + lift. Default: так.
- **Q7** Скрол: без скролбарів на тілі модалки; ліва колонка — одне textarea, права — два панелі (Expected/Actual) кожна зі своїм скролом. Default: так.
- **Q8** Дефолтна назва «From finding: {title}» ≤80. Default: так.
- **Q9** Один running run на власника будь-якого scope. Default: так.
- **Q10** Один spec у двох фазах (A: PR→модалка, табів, layout; B: single-case run). Default: один spec, дві фази.

Self-check: all 9 items pass (нічого не записано; Insights read; одна таблиця; 10 high; research ≤4 незалежні; Supersedes — `—`; 3 blocking із default; repo-claims із шляхами, невідоме позначено — зміст вкладки «Files»).

---

## Hand-back 2

## Phase 2 done: SPEC-10 draft written

**Path:** `/Users/harlock/Downloads/Sites/devdigest/specs/10-eval-case-editor-run.md`
**Spec ID:** SPEC-10 · **Status:** draft · **Supersedes:** — (the overridden SPEC-08 and SPEC-09 items are listed in a table in Goals, same approach as SPEC-09; this is Q-5)
**Placement:** root `specs/` because the feature spans `client/`, `server/` and both vendor `shared` copies. I re-checked numbering: the highest existing prefix was 09, so this is 10.

**Counts:** US 5 · AC 50 · EC 30 · NFR 16 · UI 11 · Q 14 (open questions, all with defaults).

**Lint: not run.** I have no Bash, so the deterministic lint was not executed. Please run:
`node .claude/skills/spec-authoring/scripts/lint-spec.mjs /Users/harlock/Downloads/Sites/devdigest/specs/10-eval-case-editor-run.md`
I read `lint-spec.mjs` and checked the draft against its rules by hand:
- A grep for vague words found one `may` in UI-7, now fixed.
- A grep for two `(shall)` in one line found none.
- AC-39 had a second `КОЛИ` clause and is now one sentence.
- I checked headings, item prefixes, story references and EC triggers by reading, not by running the lint.

**Self-check:** all Phase 2 items pass on a manual read. Two limits: the lint result above is unconfirmed, and the figures in NFR-13 (1 s and 500 ms) and EC-23 (3 and 6 min) are targets I set, not measurements. Both are on the Q list for the user.

**What the spec contains (your defaults marked "default, user may revise" in a Decisions table and in Q-1…Q-14):**
- **Q1 = A.** The Expected output JSON is an array of exactly one `EvalExpectation`, and the type comes from a type switch, not from the JSON. The scorer is unchanged.
- **Mockup 3 deviation.** It shows `[]` for the negative case. The spec says why we deviate: the scorer needs a location, and `[]` semantics exist only in the old full-build reference (researcher R2). The negative banner shows the location (AC-16).
- **Q2 = B.** The case run is an `eval_runs` row with `scope = 'case'` (one add-column migration via `pnpm db:generate`).
  - **Run case** is enabled only for a saved, unmodified case; **Run on save** is the one-click path.
  - Option C (a separate table) is a stated fallback; ephemeral and dry-run options are rejected in Non-goals.
- **Q3.** A finding-seeded case is editable until the first Save, then SPEC-09 EC-6/EC-7 lock it (AC-12, AC-13).
- **Q4.** Skill-owned Run case runs both arms in the carrier, via the SPEC-09 carrier dialog (AC-40, AC-44).
- **Q9.** One running run per owner of any scope, answered `409 eval_run_in_progress` (EC-18, AC-49).
- **Q11.** The server routes `GET /findings/:id/eval-skills` and `POST /findings/:id/skill-eval-case` stay; only the client `SkillEvalMenu` goes.
- **R1 → NFR-5.** The list of set-aggregate readers that must filter `scope = 'set'` and the list that must stay unfiltered, with a DB-backed test. Also AC-46 (per-case latest result from the newest finished run of any scope), AC-47, AC-48 (`running_run_id` points at a set run only, plus a new `running_case_run` field) and EC-28 (compare returns 404 for a case run).
- **R2 → scope of new UI.** AC-21 defines what **+ Finding skeleton** inserts and AC-22 defines Actual output. The mockup labels (banner, subtitle, toggle) are recorded as new design with no code behind them.
- **R3 → removal checklist.** A "Removal checklist (Phase A)" is in Goals and NFR-16 makes it checkable by search. The `client/INSIGHTS.md` 2026-10-11 entry is marked obsolete and left to the `engineering-insights` skill.
- **Also included:** the gap-vs-mockup table, the Deviations list, and the layout fix. The layout fix covers a fixed header, the result banner in the footer slot above the buttons, and no scrollbar on the modal body or a column (AC-23, AC-24, NFR-11). The vendor `Modal` stays untouched. NFR-10 requires status icon plus text or aria-label. AC-30 defines the "expected N finding(s), got M · recall X%" line, with recall shown only for `must_find`. The cost banner shows "—" when cost is null.
- **Phase A** (AC-1–AC-32) is the modal, the draft route, the optional input on the finding routes, both tabs and the removal. **Phase B** (AC-33–AC-50) is the case run.

**Remaining open questions** (non-blocking, all defaulted). Q-1 to Q-11 are your answers restated. Four are new detail decisions of mine:
- **Q-12:** polling timeout of 3 min (agent case) and 6 min (skill case).
- **Q-13:** the finding card shows **In eval set** only when the agent and every skill of the review already have a case. The card reads skills through the existing `GET /findings/:id/eval-skills` while expanded. I chose this because the card shows its actions only when expanded, so no extra fetch is needed.
- **Q-14:** the **Files** tab lists the diff's new-side paths with the expectation's file marked, since the mockups don't show it.
- **New contract detail (inside the Contracts block, no Q number):** `POST /findings/:id/skill-eval-case` gets an optional `input` field and `POST /findings/:id/eval-case` an optional body. Both are parsed by hand, per `server/INSIGHTS.md` 2026-09-20. The planner can adjust the exact shape.

**No blocking questions.**

---

## Hand-back 3

## SPEC-10 amended: `/Users/harlock/Downloads/Sites/devdigest/specs/10-eval-case-editor-run.md` (Status: draft)

**Lint: not run by me.** I have no Bash in this session, so I could not execute `lint-spec.mjs`. The main session reported `ok` on the earlier version, so this amended version needs the lint run again. Run `node .claude/skills/spec-authoring/scripts/lint-spec.mjs specs/10-eval-case-editor-run.md`. Checks I did by hand, with Grep:
- 113 `(shall)` occurrences, equal to AC 51 + EC 31 + NFR 20 + UI 11, and no line has two.
- 132 item lines in total: US 5, AC 51, EC 31, NFR 20, UI 11, Q 14.
- No vague words from the lint list in AC/EC/NFR/UI. The remaining hits ("should match", "several") are in Goals and tables, which the lint does not check.
- I re-read each edited sentence against the EARS triggers.

**Claims verified before relying on them:**
- `service.ts:85` `FINISHED_STATUSES`; `repository.ts:46` `FINISHED` is `completed` | `partial`.
- `helpers.ts:475-478` `finalStatus` returns `errored` when `traces_total === 0`. Amendment 1 cited `service.ts:500` for the single-errored-case-run behaviour. The status is computed at `service.ts:494-500` through `finalStatus`, so the spec cites `helpers.ts:475-478` plus `service.ts:85`.
- `routes.ts:77-95` (skill route answers 201 or 200); the agent 409 is `service.ts:112`.
- `repository.ts:1012-1030` (`agentRuns()`, `skillRuns()`). `repository.ts:583` is the any-scope `runningRunId` inside `insertRun`.
- `recentRunSummaries` (`repository.ts:762-768`) bypasses `agentRuns()`. `listSkillTrendRows` and `latestFinishedSkillResults` go through `skillRuns()`.
- `knowledge.ts:384` `EvalCaseOutcome.findings` is required.
- `server/package.json:17` is `verify:l06`.
- Parity-test regions are as you stated.
- `i18n-key-coverage.test.ts` thresholds are at lines 80 and 81; the `RunDialog` root is in `ROOTS`.
- The `RunDialog` folder (4 files) exists, used by `SkillEditor.tsx` and the skill `EvalsTab.test.tsx`.
- Latest migration is `0024_bouncy_sleepwalker.sql`, so `0025_*` is next.
- Service line ranges cited in NFR-17 (232-248, 280-292, 316-330) match the code I read.

**What changed, by ID (amendment number in brackets):**
- **Goals:**
  - The consent is recorded (user approved all defaults, migration `0025_*` via `pnpm db:generate`, both vendor copies edited, one commit per phase).
  - New "Design constraints" subsection. It covers reuse of the set executor (`startRun` / `startSkillRun` with a one-case set and a `scope` parameter), the errored-is-not-finished note, the `carrier-run-dialog` move, and the empty banner slot in Phase A [10, 15].
  - Decisions heading says "approved by the user".
- **Delivery table:**
  - Phase A and Phase B ID lists updated.
  - Phase A contract commit: `EvalCaseDraft`, `EvalExpectationInput.title`, `EvalCaseLatestResult.findings`/`effect`, `input?` on `SkillEvalCaseRequest`.
  - Phase B contract commit: `EvalRunScope`, `scope` on four run shapes, `running_case_run` [12].
- **Removal checklist:** the `FindingsPanel.test` mock is retargeted to `useFindingSkills`, not dropped [9].
- **AC-6:** "201, or 200 with the existing case when the skill route finds one" [4].
- **AC-22 / AC-26:** both now point to AC-46; `findings` stays `.nullish()` because `EvalCaseOutcome.findings` is required. `ran_at` is removed from the contract block [8].
- **AC-29 / AC-39:** **Run** exists on either Evals tab, and AC-39 hands skill-owned cases to the carrier dialog [2].
- **AC-43:** the `1/1` / `0/1` count is derived client-side from `state`, omitted when errored, no new field [6].
- **AC-45:** now agent-owned only. **New AC-51:** Run on save for a skill-owned case opens the carrier dialog after a successful Save [3].
- **AC-46:** latest result = the later-started of the newest finished set run containing the case and the newest completed / partial / errored case run of it [1].
- **EC-5:** the agent route's 409 and the skill route's 200 are handled alike on the client [4].
- **EC-7 / UI-2:** the server-side 10,000-byte clause is dropped; the cap is client-only [7].
- **EC-13:** reworded for a result that lacks `findings` [8].
- **EC-19:** adds the Run on save toggle disabled when no carrier exists [3].
- **EC-21:** an errored case run is not finished but is still the case's latest result, so the banner survives a reload [1].
- **EC-27:** the "before the next review" clause now applies only between the two arms of a skill case [13].
- **New EC-31:** cancelling the carrier dialog opened by Run on save keeps the saved case and starts no run [3].
- **NFR-5:** rewritten. `scope='set'` goes in `agentRuns()` / `skillRuns()` plus the bypassing readers and set-only `runningRunId` / `runningSkillRunId` variants. `compare` answers 404 for a case run. The any-scope lookup behind the 409 stays unfiltered [5].
- **New NFR-17:** a new bounded any-scope per-case reader for `listCases`, `getCase` and `listSkillCases` [5].
- **New NFR-18:** `server/test/eval-case-run.it.test.ts` (snapshot every reader, finish a case run, re-snapshot), listed in `verify:l06` [5].
- **NFR-7:** one commit per phase, new type names start with `Eval`, inside the parity-test regions, no `.default()` [12].
- **NFR-8:** adds a hermetic fixture lacking `findings` [8].
- **NFR-11:** layout verified by a unit test asserting `min-height: 0` / `overflow: hidden` plus a manual browser check at 1280×720 and 768×600 recorded in the PR description; no e2e flow [11].
- **NFR-16:** adds that the `FindingsPanel.test` mock is retargeted [9].
- **New NFR-19:** the carrier dialog moves to `client/src/components/carrier-run-dialog/` [10].
- **New NFR-20:** `i18n-key-coverage` roots changed and thresholds re-checked [14].
- **Provenance and contracts block:** updated to match.
- **Open questions intro:** now says the defaults were approved. Q-1 to Q-14 are unchanged.

**New open questions:** none, blocking or non-blocking.