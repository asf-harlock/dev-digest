# Workflow retro — SPEC-11 Export to CI (2026-10-13)

Session `50d95a7c-e5e7-4d51-aa98-931552b0dbcb` · span 1100.2 min · active 70.7 min (оркестратор) · 22 агенти · max parallel 5
Numbers include this retro's first call (збір метрик) — ця ретроспектива і сама є частиною сесії.
Span включає ≈14 год простою між завершенням роботи (`2026-10-12T19:45Z`) і запуском ретро (`2026-10-13T10:27Z`); для порівняння корисніше `activeMin`, а не `spanMin`. Вікно (`--from/--until`) не задавалося: уся сесія — це один воркфлоу (intake → research → spec → plan → `/run-plan`).

## Numbers
| Actor | Model | Active min | Fresh tokens | Output | Cache read | Tools | Errors | Resumes |
|---|---|---|---|---|---|---|---|---|
| orchestrator | opus-5-5 (20 calls) → sonnet-5-5 (159 calls) | 70.7 | 1 288 650 | 140 819 | 55 114 449 | 182 | 4 | — |
| 1. implementation-planner — Plan Export-to-CI (phase 1) | sonnet-5-5 | 3.0 | 93 053 | 1 101 | 770 429 | 25 | 0 | 0 |
| 2. spec-creator — Spec intake | sonnet-5-5 | 7.8 | 489 397 | 70 689 | 3 064 861 | 78 | 0 | 1 |
| 3. researcher — R1 prior CI impl in git | sonnet-5-5 | 1.4 | 95 499 | 588 | 984 182 | 44 | 1 | 0 |
| 4. researcher — R2 runner bundle standalone | sonnet-5-5 | 0.9 | 28 862 | 363 | 193 528 | 16 | 2 | 0 |
| 5. researcher — R3 agent_runs readers | sonnet-5-5 | 1.0 | 52 002 | 262 | 345 349 | 16 | 1 | 0 |
| 6. researcher — R4 GitHub PAT perms | sonnet-5-5 | 2.2 | 31 874 | 61 | 193 445 | 27 | 0 | 0 |
| 7. implementation-planner — Plan SPEC-11 | sonnet-5-5 | 7.8 | 164 402 | 205 | 2 289 487 | 36 | 0 | 1 |
| 8. implementer — W0 runner gate | sonnet-5-5 | 2.1 | 46 430 | 196 | 660 918 | 17 | 2 | 0 |
| 9. implementer — W1 contracts/schema/migration | sonnet-5-5 | 3.7 | 100 856 | 2 402 | 1 965 705 | 26 | 0 | 0 |
| 10. implementer — W2a generators/ingest | sonnet-5-5 | 6.6 (span 66.1) | 356 679 | 20 889 | 4 506 352 | 42 | 0 | 0 |
| 11. implementer — W2b GitHub port/repository | sonnet-5-5 | 4.3 | 107 186 | 8 023 | 1 879 444 | 26 | 1 | 0 |
| 12. implementer — W3 hooks/CI Runs/nav | sonnet-5-5 | 8.4 | 399 936 | 6 864 | 6 623 909 | 54 | 1 | 1 |
| 13. implementer — W4a wizard | sonnet-5-5 | 8.5 | 339 807 | 1 200 | 4 892 098 | 45 | 1 | 1 |
| 14. implementer — W4b CI tab | sonnet-5-5 | 6.2 | 150 636 | 4 358 | 4 364 742 | 47 | 1 | 0 |
| 15. implementer — W2c service/routes | sonnet-5-5 | 11.6 | 917 974 | 13 682 | 11 143 320 | 74 | 2 | 4 |
| 16. implementer — W6 e2e flow/script | sonnet-5-5 | 1.8 | 71 901 | 151 | 984 336 | 19 | 0 | 0 |
| 17. test-writer — client tests | sonnet-5-5 | 4.0 | 123 799 | 539 | 1 937 953 | 23 | 1 | 0 |
| 18. test-writer — W5 server tests | sonnet-5-5 | 11.0 | 316 259 | 60 429 | 8 656 304 | 59 | 0 | 0 |
| 19. plan-verifier — verify #1 (+ pass 2 by resume) | sonnet-5-5 | 7.6 | 442 125 | 672 | 6 981 119 | 49 | 0 | 1 |
| 20. architecture-reviewer | sonnet-5-5 | 2.2 | 217 286 | 151 | 667 638 | 19 | 1 | 2 |
| 21. security-reviewer | sonnet-5-5 | 2.9 | 265 841 | 3 444 | 1 656 153 | 29 | 1 | 1 |
| 22. general-purpose — bug review | sonnet-5-5 | 6.0 | 435 445 | 3 614 | 5 773 577 | 46 | 0 | 1 |
| **Total** | | | **6 535 899** | **340 702** | **125 649 298** | | **19** | **13** |

Orchestrator share of fresh tokens: 0.20. `cache_read` (125,6 M) — переважно той самий контекст, який перечитується щоходу; у «витрачених токенах» його не враховано.
Tools = число викликів інструментів без `SubagentHandback`. Усі агенти працювали на Sonnet 5.5; `requestedModel` у всіх `null`.

## Outcome
| Gate | Runs | Fails | First try | Final |
|---|---|---|---|---|
| `lint-spec.mjs` | 2 | 0 | так | так |
| `scripts/check.sh` | 31 | 11 | так | так |
| `vitest` | 12 | 7 | ні | так |
| `npm run build` | 3 | 1 | ні | так |
| `npm run typecheck` | 3 | 2 | так | ні (див. нижче) |
| `pnpm arch` | 3 | 1 | так | ні (див. нижче) |

**Читати обережно.** `typecheck` і `arch` у `finalPass: false` — це евристика парсингу виводу: обидва «падіння» взято з ланцюжків команд, де хвіст виводу містив чужі рядки (`FAIL test/skills-stats…` з базового списку; фрагмент коду в `tail` у `architecture-reviewer`). Справжні запуски `typecheck`/`arch` у кінці були PASS (`PASS server:typecheck`, `PASS client:arch` і т. д. у `gateRuns` та в звітах верифікатора). 11 падінь `scripts/check.sh` — майже всі проміжні стани паралельних воркстрімів (`Cannot find module './ExportWizard'`, `No files matching the pattern …`), які самі зникли без резюму.

`/run-plan` (SPEC-11): verify rounds 2, review rounds 3.
- Verify #1: жоден ID зі специфікації не Fail; з пунктів плану — 2 Fail (P12b, P13b: стандартний набір файлів у папках компонентів), 3 Unverified. Verify #2 (дельта): 0 Fail по ID, P12b/P13b → «accepted by user decision (V1 skip)».
- `quality.sdd` показує verify-2 як `pass 0 / fail 2 / unverified 2` — це артефакт парсингу моїх стислих `verify-*.md`, а не результат (див. «Orchestrator → Missed»).
- Review: раунд 1 — 10 знахідок, усі WARNING (0 CRITICAL); раунд 2 — 1 нова (A3, WARNING) + S1/B1–B3/A1 вирішено; раунд 3 — 0 нових. `review-round-1.json` — єдиний збережений файл раундів (див. Missed).
Resumes: 13 · errors: `exit` 13, `other` 6.

## Trend
Порівнювані прогони — SPEC-08/09/10 (той самий склад ролей: spec-creator/researcher/planner/implementer/test-writer/verifier/reviewers). Беру останній, `2026-10-12-spec-10-eval-case-editor`:
- Fresh tokens: 5 642 413 → 6 535 899 (Δ +893 486, +16 %).
- Active min: 50.2 → 70.7 (Δ +20.5).
- Resumes: 12 → 13 (Δ +1).
- Orchestrator share: 0.07 → 0.20 (Δ +0.13) — найбільший зсув (див. Orchestrator).
- Gates first-try: 3/4 → 4/6 (Δ — з урахуванням евристики вище).
- Errors: 8 → 19 (Δ +11); maxParallel 4 → 5.
Розмір фічі в історії не зафіксований, тож Δ у токенах не можна напряму читати як регрес.

## Order
1. `16:08` implementation-planner (phase 1) — на прохання користувача.
2. `16:11` користувач перервав: «I want to use spec-creator» → spec-creator.
3. `16:17` researcher R1–R4 в одному повідомленні (паралельно, ≤ 2.2 хв кожен).
4. `16:18` AskUserQuestion (Q1–Q3) → **очікування користувача 112 хв** (`16:19 → 18:11`).
5. `18:18` implementation-planner (SPEC-11) → `18:23` питання про дозволи → `18:24` resume.
6. `18:32` W0 (hard gate) → `18:35` W1.
7. `18:39` W2a, W2b, W3, W4a, W4b — **5 паралельно в одному повідомленні** (maxParallel 5).
8. `18:48` W2c, W6, client test-writer — паралельно (W2c чекав W2a/W2b).
9. `18:57` W5 (server test-writer) — після W2c і застосування міграції.
10. `19:17–19:18` plan-verifier #1 + architecture + security + bug review — паралельно (відступ від порядку `run-plan`: verify і review разом).
11. `19:25` три fix-resume паралельно (W2c / W4a / W3), `19:28` три re-review resume паралельно.
12. `19:37` A3 fix, `19:39` verify #2 + re-review A3, `19:42` `engineering-insights`.

## Per agent
### 1. implementation-planner — Plan Export-to-CI (phase 1)
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue | Корінь `CLAUDE.md` («Writing or revising a feature spec → use the `spec-creator` agent») веде до spec-creator; користувач перенаправив через 3 хв (`16:11`, «I want to use spec-creator»). 93 053 fresh на фазу 1, яку замінили. |
| Hard | ok | 0 помилок; сам зазначив у звіті, що «за конвенцією репо спочатку мав би бути SPEC-NN». |
| Easy | ok | 25 викликів, 3 хв активного часу, звіт 22 697 символів із факт-таблицями (dist у `.gitignore`, прогалини контрактів). |
| Duplicated | issue | `topology`: 21 спільний файл зі spec-creator (`agent-runner/*`, `db/schema/{ci,runs}.ts`, `eval-ci.ts`), 20 — з другим planner. |
| Missed | ok | Факти пішли в spec-creator як «prior evidence»; 17 питань заново переглянуті spec-creator. |
| Hand-off | ok | Орк. стиснув до питань + дефолтів; великий звіт не пересилався дослівно. |
| Prompt | ok | Промпт 5 359 символів з посиланнями на скріншоти. |

### 2. spec-creator — Spec intake: Export to CI
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Прапорець `top-tier read-only` відсутній (Sonnet 5.5, `flags: []`). Критерій експерименту з коментаря в `.claude/agents/spec-creator.md`: `lint-spec.mjs` чистий з першого разу (`18:17`, 0 fails з 2 запусків); planner #2 позначив не-Clear лише ≈8 рядків (AC-28/34, AC-32, EC-25…), жоден ID зі специфікації не Fail у verify #1/#2. **Критерій виконано в цьому прогоні.** |
| Hard | ok | `spanMin` 125.4 проти `activeMin` 7.8 — це очікування користувача, не робота. |
| Easy | ok | 489 397 fresh за 7.8 хв; 3 blocking-питання з дефолтами, 4 research-запити, незалежні. |
| Duplicated | ok (навмисно) | Перечитав 37 файлів, бо промпт вимагав верифікувати факти planner #1 («treat as data»). |
| Missed | ok | Q-2 (runnability бандла) лишив відкритим, бо R2 не зміг виконати (див. R2); решту покрив. |
| Hand-off | ok | Звіт 29 703 символи (2 hand-back); spec написано з першого resume; запит на правки не було. |
| Prompt | ok | 5 526 символів; містив пряму вказівку не писати файл у фазі 1. |

### 3. researcher — R1 prior CI implementation in git
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | `Bash` 41 з 44 викликів — читання git-історії; доречно для researcher. |
| Hard | ok | 1 hook-помилка (`researcher-guard: sed scripts are limited to N,Mp`), обійшов. |
| Easy | ok | 1.4 хв; знайшов Gen 2 на `upstream/full-functionality`, яке потім стало основою плану й W2*. |
| Duplicated | ok | — |
| Missed | ok | — |
| Hand-off | ok | Звіт 10 107 символів; передано spec-creator дослівно. |
| Prompt | ok | 1 140 символів, одне фальсифіковане питання з `git log -S` командами. |

### 4. researcher — R2 runner bundle standalone
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | **issue** | Промпт просив зібрати й запустити `node` — `researcher-guard: \`node\` is not on the researcher's read-only allowlist`. Звіт: «Not tested». Неправильний агент для виконавчої задачі. |
| Hard | issue | 2 помилки (hook + `ugrep: workflow.ts: No such file`), 16 викликів, результат — лише статичний аналіз. |
| Easy | — | — |
| Duplicated | ok | — |
| Missed | **issue** | Питання лишилося як Q-2 у spec і було закрите лише W0 (+46 430 fresh, `18:32`). |
| Hand-off | ok | Чесно перелічив «Could not determine» і команди для запуску. |
| Prompt | issue | Промпт не попереджав, що researcher не може виконувати; spec-creator/оркестратор це не врахували. |

### 5. researcher — R3 agent_runs readers
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | — |
| Hard | ok | 1 помилка: інструмент `Grep` недоступний у сесії (`No such tool available: Grep`), перейшов на `grep` через Bash. |
| Easy | ok | 1.0 хв, таблиця reader → ефект (a/b/c/d). |
| Duplicated | ok | — |
| Missed | ok | Прямо використана як AC-64/AC-65/NFR-16. |
| Hand-off | ok | 7 602 символи, таблиця. |
| Prompt | ok | 1 166 символів. |

### 6. researcher — R4 GitHub PAT perms
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Зовнішнє дослідження, `readShare` 1; output 61 токен (звіт збирався з WebFetch). |
| Hard | ok | 0 помилок. |
| Easy | ok | 2.2 хв, цитує docs.github.com; честно відмічає unverified. |
| Duplicated | ok | — |
| Missed | ok | Підтвердив: same-repo PR підробляє артефакт → UI-10/Q-8; права Workflows write. |
| Hand-off | ok | 12 185 символів; використано як evidence. |
| Prompt | ok | 1 498 символів, питання (a)–(e). |

### 7. implementation-planner — Plan SPEC-11
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 164 402 fresh, 36 викликів, 9.8 хв. |
| Hard | ok | Сам закрив Q-13 через `git ls-remote` (SHA для checkout/setup-node/upload-artifact). |
| Easy | ok | `plan.md` (147 рядків) з Execution-таблицею та власністю файлів: 5 паралельних воркстрімів без колізій (єдиний спільний файл `ci.json` — валідний JSON після всіх правок). |
| Duplicated | issue | `topology`: 20 спільних файлів із phase-1 planner, 12 — з W2a. |
| Missed | **issue** | EC-25/Q6 default («404 → 0 запусків для pending_pr/manual, `github_permission` для active») не назвав, яке поле проносить 404/403 через межу адаптера → W2b склав обидва в `github_permission` → знахідка **B2** (баг-рев'ю, «403 swallowed as no runs»). Також DB-тести репозиторію заплановано лише у W5 після W2c → **bug 1** (raw `Date` у `sql`) знайшов лише W5. |
| Hand-off | ok | План дослівний; оркестратор давав агентам лише шляхи й кроки. |
| Prompt | ok | Дозволи й рішення Q1–Q5 передано списком. |

### 8. implementer — W0 runner gate
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 46 430 fresh, 2.1 хв. |
| Hard | issue | Збірка спершу впала (`TS2307 Cannot find module 'zod'`, `npm run build` у `gateRuns`): промпт не згадав, що `server/node_modules` потрібен. Виправив сам. |
| Easy | ok | Чіткий `GATE PASS` + знахідка «копіювати весь `dist/`» (потім запис у корінь `INSIGHTS.md`). |
| Duplicated | ok | — |
| Missed | ok | — |
| Hand-off | ok | 5 пунктів ризиків; використано в промптах W2a/W6. |
| Prompt | issue | Не вказав залежності для збірки (див. Hard). |

### 9. implementer — W1 contracts/schema/migration
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 100 856 fresh, 0 помилок, 3.7 хв. |
| Hard | ok | Один регенерований 0026 (`DESC NULLS LAST`), сам виправив. |
| Easy | ok | Міграцію перевірив на тимчасовій БД з legacy-даними та дублікатами; основну не чіпав. |
| Duplicated | ok | — |
| Missed | ok | `yaml ^2.9.0` замість `^2.6.1` — розкрито у звіті. |
| Hand-off | ok | Таблиця експортованих імен — використана в промптах 5 наступних воркстрімів. |
| Prompt | ok | — |

### 10. implementer — W2a generators/ingest
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 356 679 fresh, 20 889 output, 42 виклики. |
| Hard | **issue** | `spanMin` 66.1 проти `activeMin` 6.6: shell-процес `58554` з командою `… cat > /tmp/x 2>/dev/null; …` (без файла-джерела) годину чекав stdin; harness тримав агента «running». Користувач запитав «what is going there?» і одне повідомлення пішло на розбір. |
| Easy | ok | 104 тести, `assemble.ts` додано з поясненням. |
| Duplicated | ok | Читав `specs/11` ×3, `eval-ci.ts` ×2. |
| Missed | ok | — |
| Hand-off | ok | Список публічних експортів — основа промпту W2c. |
| Prompt | ok | — |

### 11. implementer — W2b GitHub port/repository
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 107 186 fresh. |
| Hard | ok | 1 помилка (`No files matching the pattern` у lint), виправив. |
| Easy | ok | Звіт сам розкрив ризики: «SQL не запускався проти Postgres», throttle вимкнено для всього клієнта. |
| Duplicated | ok | — |
| Missed | **issue** | (1) 403/404 → один `github_permission` (B2); (2) `ON CONFLICT`/`selectDistinctOn` без `.it`-тесту — наслідок: bug 1 виявлено лише у W5; (3) глобальний `throttle` → питання до користувача. |
| Hand-off | ok | Найчесніший звіт ранжу: Deviations 1–4 дослівно (`throttle`, `getRef` fallback, `getArtifact`, mock). |
| Prompt | ok | — |

### 12. implementer — W3 hooks/CI Runs/nav
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 399 936 fresh, 54 виклики, 6 623 909 cache read. |
| Hard | ok | 1 помилка: `typecheck` впав на `./ExportWizard` з W4a (паралельна залежність), зникла сама. |
| Easy | ok | 44 тести, чіткі сигнатури хуків, які W4a/W4b використали без уточнень. |
| Duplicated | ok | — |
| Missed | **issue** | M1–M3 + A1: `position:absolute` sr-only у скролері, фіксовані ширини колонок, дубль `formatCost/isTrustedJobUrl` — jsdom їх не бачить; знайшов лише мій перемір (845 px vs 768). Сам чесно написав «needs your browser re-measure». |
| Hand-off | ok | — |
| Prompt | ok | Спільний `ci.json` оголошено з обмеженням «лише свої блоки». |

### 13. implementer — W4a wizard
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 339 807 fresh, 1 200 output (код переважно в `Write`). |
| Hard | ok | 1 помилка (чужий файл у проміжному стані). |
| Easy | ok | 66→79 тестів; власний stepper замість vendored — обґрунтовано NFR-13 (`aria-current`). |
| Duplicated | ok | — |
| Missed | **issue** | **B1** (`initial?.repo ?? null` лишає `""` → Continue заблокований при одному репо) + **B3**. Баг-рев'юер: тест AC-44 (`ExportWizard.test.tsx:503`) перевіряв лише DOM-значення `select`, тож проходив. Баг пережив і тести імплементера, і тести test-writer (він додав свій AC-44 `without an initial repository`; чи це той самий тест, що на :503, я не з'ясовував) — його знайшов лише баг-рев'юер. |
| Hand-off | ok | Розкрито double-toast trap, відхилення від макета («Download as zip»). |
| Prompt | ok | — |

### 14. implementer — W4b CI tab
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 150 636 fresh, 47 викликів, 0 резюме. |
| Hard | ok | 1 помилка (чужий файл у проміжному стані). |
| Easy | ok | Застосував `client/INSIGHTS.md` (ключ вкладки у двох місцях), 51 тест. |
| Duplicated | ok | `topology` пропонує resume W4a/W3 замість нового — відхилено (див. Topology). |
| Missed | issue | Те саме sr-only/дубль helpers у `RunHistory` (M3, A1) — виправлено W3 під час fix-раунду. |
| Hand-off | ok | Відхилення (шлях імпорту, EC-31 stale notice) розкрито. |
| Prompt | ok | — |

### 15. implementer — W2c service/routes
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 917 974 fresh (**14 %**), 74 виклики, 11 143 320 cache read. Прапорець `4 resumes` — **підтверджую як сигнал, але не як проблему промпту**: 4 resume = 4 fix-раунди за дизайном `run-plan` (атомарність AC-60; 2 баги від W5; S1/B2/throttle; A3). Перший промпт містив усі факти — жодного уточнюючого питання. |
| Hard | issue | 2 помилки; 3 з 4 fix-раундів — наслідки дефектів, які hermetic-тести з підробленим repository не бачили (raw `Date` у `failStaleRunning`, EC-9 retry у `commitFiles`, 403/404). |
| Easy | ok | Перша здача пройшла `typecheck`/`lint`/`arch`/`related`; 966 тестів. |
| Duplicated | ok | — |
| Missed | **issue** | bug 1 (500 на refresh), B2, S1 (`pr_number` без межі), A3 (inline літерал в `errors.ts`). AC-60 прогалину він сам розкрив у звіті → виправлено в тому ж resume. |
| Hand-off | ok | Таблиця маршрутів, відхилення, «Gap (not fixed)» — прямо перетворено на fix. |
| Prompt | ok | Довгий, але фактичний («Handoff facts you must apply»). |

### 16. implementer — W6 e2e flow/script
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 71 901 fresh, 1.7 хв, 0 помилок. |
| Hard | ok | — |
| Easy | ok | `bash -n`/`typecheck` PASS; ланцюжок збірки runner у правильному порядку. |
| Duplicated | ok | — |
| Missed | issue | Flow 12 **не запускався** (P15 Unverified) і не перевіряє, що `acme/payments-api` обрано за замовчуванням — залежало від Docker і маршрутів W2c, які на момент W6 ще не були готові. |
| Hand-off | ok | Чітко перелічив, що має виконати сервер (preview без токена, `[]` на чистій БД). |
| Prompt | ok | — |

### 17. test-writer — client tests
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 123 799 fresh, 4.0 хв; 790 → 907 тестів. |
| Hard | ok | 1 помилка. |
| Easy | ok | Таблиця AC/EC → тест; 54 перейменування лише префіксами. |
| Duplicated | ok | — |
| Missed | **issue** | B1 пройшов повз клієнтські тести: тест AC-44, який баг-рев'юер цитує (`:503`), перевіряв значення `select`, а не доступність Continue (див. 13; чи це саме його тест — не встановлено). |
| Hand-off | ok | Мапа AC/EC і «not testable in jsdom: NFR-14». |
| Prompt | ok | — |

### 18. test-writer — W5 server tests
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 316 259 fresh, 60 429 output, 11 хв: **найвища цінність на токен за прогон** — знайшов 2 реальні дефекти. |
| Hard | ok | 0 помилок; 7 з 12 `vitest`-запусків червоні — його власні Docker-тести під час написання. |
| Easy | ok | 76 hermetic + 42 Docker; `ci-pr-isolation.it` перевіряє NFR-16. |
| Duplicated | ok | — |
| Missed | ok | — |
| Hand-off | ok | Bug-репорт із file:line, Proof («stub failStaleRunning → тести зелені»). |
| Prompt | ok | — |

### 19. plan-verifier — verify #1 (+ pass 2 через resume)
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 442 125 fresh, 7.6 хв активних; pass 2 — resume, не новий агент (за `run-plan`). |
| Hard | ok | — |
| Easy | ok | 0 Fail по 65+37+16+13 ID; сам перезапустив gates і 4 Docker-файли. |
| Duplicated | ok (за дизайном) | Перезапуск `check.sh all` і `.it` після того, як оркестратор щойно їх прогнав (`19:13`, `19:28`) — verifier зобов'язаний не довіряти попереднім самозвітам. |
| Missed | ok | — |
| Hand-off | issue | Verifier не має `Write`: оркестратор зберіг лише стислу копію (див. Orchestrator). P12b/P13b позначив Fail за буквою `client/CLAUDE.md` («fixed set of files») — пішло користувачу на рішення (V1 skip), цінність низька. |
| Prompt | ok | Передано ручні виміри й перелік відкритих візуальних дефектів. |

### 20. architecture-reviewer
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 217 286 fresh, 2.2 хв; `pnpm arch` обох пакетів PASS. |
| Hard | ok | 1 помилка. |
| Easy | ok | 2 WARNING (A1, A2); 4 з моїх підозр коректно відхилив як не-порушення (AppError в адаптері, throttle, замки, `mocks.ts`). |
| Duplicated | ok | — |
| Missed | ok | A3 з'явився лише на коді, який додав fix (прозові правила — без машинної перевірки). |
| Hand-off | ok | Окремо виніс throttle як «зміну поведінки поза правилами» → питання користувачу. |
| Prompt | ok | Re-review через resume (2 resumes) — без повторного читання. |

### 21. security-reviewer
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 265 841 fresh, `readShare` 0.48. |
| Hard | ok | 1 помилка. |
| Easy | ok | 1 знахідка (S1, 0.65); решта 8 областей — «Checked, nothing found» зі шляхами. |
| Duplicated | ok | — |
| Missed | ok | Не перевіряв `pnpm audit` для `yaml` (сам відзначив). |
| Hand-off | ok | — |
| Prompt | ok | Список sink-ів (a)–(h) з UI-n специфікації. |

### 22. general-purpose — bug review
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 435 445 fresh; `model: sonnet` передано явно (за `run-plan`). |
| Hard | ok | 0 помилок. |
| Easy | ok | 3 WARNING, усі підтверджені й виправлені (B1 0.8, B2 0.65, B3 0.6); re-review чистий. |
| Duplicated | ok | — |
| Missed | ok | — |
| Hand-off | ok | Failing input для кожної знахідки. |
| Prompt | ok | Дав список «вже відомого», щоб не повторювати. |

### Orchestrator
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue | `orchestratorShareFresh` 0.20 (було 0.07 у SPEC-10). Структура викликів: Bash 64 + Playwright 64 з 182 (≈ 70 %) — тобто ручна браузерна фаза 2b, три повні outer-loop прогони, робота з БД/seed. Моделі: 20 викликів Opus (планування), 159 Sonnet (після `/model sonnet`). |
| Hard | issue | 4 помилки: (a) Bash-ланцюжок з `echo "======"` у zsh (`19:42`, exit 1); (b) некоректний JSON у `AskUserQuestion` (`18:55`, довелося питати двічі); (c) `browser_click` до завантаження сторінки (`19:14`). Власні помилки, не з метрик: `pkill -f "next dev -p 3100"` зупинив чужий Next-сервер (повідомив користувача того ж ходу); seed з `verdict` поза enum контракту → `/ci/runs` 500, 2 помилки консолі (~2 хв, виправлено). |
| Easy | ok | Фаза 2b знайшла M1–M3 — те, чого не бачили ні reviewers, ні verifier (jsdom): `document.scrollWidth` 845 → 768 після фіксу. Ручні виміри (1280/768) дали числа, а не враження. |
| Duplicated | issue | `sharedReads`: `plan.md` — 6 читань оркестратором (і 10 агентами); `INSIGHTS.md` ×4, `client/INSIGHTS.md` ×4. Повний outer loop оркестратор запускав 3 рази (`19:13`, `19:28`, `19:39`) + 1 раз verifier — за дизайном skill, але 3 повних Docker-набори по ~35 с. |
| Missed | **issue** | (1) Не записав `review-round-2.json`/`review-round-3.json` (Phase 4 step 4): A3 і чисті re-review є лише в розмові та `state.json`. (2) Verifier не має `Write`, а `run-plan` вимагає зберегти відповідь «as returned»; я зберіг **стислі копії** `verify-1.md`/`verify-2.md` → `quality.sdd` показує хибні `fail: 2` для verify-2. (3) Не запустив `./scripts/e2e.sh` (flow 12) → P15 лишився Unverified. (4) Допустив, щоб R2 (виконання коду) пішов у researcher, хоча guard це забороняє. |
| Hand-off / Relays | ok | Дослівно пересилав те, що потрібне наступному агенту (списки «Handoff facts» у W2c, таблиці експортів W1), коротко — користувачу (таблиця триажу, питання з дефолтами). Жодне relay-питання не повернулося назад. |
| Prompt | ok | Fix-промпти містили id, файли власності й заборону `git stash/checkout/reset/clean` (SPEC-10 retro) — жодного інциденту зі спільним деревом. |
| Order | ok / issue | 5 воркстрімів паралельно в одному повідомленні (maxParallel 5), 3 fix-resume й 3 re-review паралельно. Відступ: verify #1 разом із reviewers (за `run-plan` — послідовно), бо ручна фаза вже була завершена; verifier довелося окремо передати нефіксовані візуальні дефекти. |
| User time | issue | 112 хв (`16:19 → 18:11`) очікування відповіді на Q1–Q3. Q3 (дозволи на vendor/міграцію/`nav.ts`) безпечного дефолту не мав; Q1/Q2 мали рекомендації, але змінювали форму специфікації. Решта п'ять питань (тести, міграція, триаж, throttle, A3) — 1–5 хв кожне. |

## Duplication
- `agent-runner/*` (CLAUDE.md, README, INSIGHTS, `src/{index,artifact,manifest,skills,context}.ts`): читали planner #1, spec-creator, planner #2, R2, W0, W2a — 4–6 читачів на файл; факти «один manifest», «`dist` у `.gitignore`», «runner нічого не POST-ить» знайдено незалежно 4 рази.
- `server/src/db/schema/ci.ts`, `runs.ts`, `eval-ci.ts`: 7–8 читачів (contract — інтерфейс, це очікувано).
- `plan.md`: 11 акторів, з них оркестратор ×6.
- Оркестратор і plan-verifier перезапускали ті самі gates (`19:13`/`19:22`, `19:28`/…): за дизайном.
- `INSIGHTS.md` ×3 файли: оркестратор читав ×11 разів сумарно (root 4, server 3, client 4).

## Topology
| Candidate | Verdict | Reason |
|---|---|---|
| merge spec-creator:a5eff9e into implementation-planner:abfa04c (one agent, both briefs) — 21 files read by both | reject | Spec має передувати плану; planner не пише специфікацію (`.claude/agents/implementation-planner.md`). Вирішується інакше — Proposal 4. |
| resume implementation-planner:abfa04c instead of launching implementation-planner:a0d7cd3 — same type, 54 % shared | **accept** | Двофазний planner за власним описом («resume it with the answers»); перший planner вже прочитав 37 файлів `agent-runner/`/схем. Ефект: до −164 402 fresh (`freshSecond`) — реально менше, бо phase 1 не мав SPEC-11. → Proposal 4. |
| resume implementer:abf3b05 instead of launching implementer:a057fc0 — 65 % shared | reject | W4a і W4b запускалися в одну хвилину (`18:39`) паралельно, мають різну власність файлів; resume серіалізував би їх. |
| merge implementer:a603a77 into implementation-planner:a0d7cd3 — 12 files | reject | Planner read-only за дизайном; W2a пише код. |
| resume implementer:a0646bc instead of launching implementer:a057fc0 — 52 % shared | reject | Те саме (паралельні воркстріми, різні файли). |
| merge researcher:ad69cb3 into implementation-planner:abfa04c — 5 files | reject | Різні ролі; справжня проблема R2 — не дублювання, а неправильний агент (Proposal 5). |
| resume implementer:a7d0227 instead of launching implementer:ae9bb6d — 58 % shared | reject | W2c залежав і від W2a, і від W2b; resume W2b усе одно потребував би читання 8 файлів W2a. Перевага мала. |
| merge implementer:a7d0227 into implementation-planner:a0d7cd3 — 6 files | reject | Planner read-only. |
| split implementer:ae9bb6d — 4 resumes, 14 % of fresh tokens | reject | 4 resume — це fix-раунди, які `run-plan` приписує; фреш-агент на кожен fix перечитував би `service.ts`/`repository.ts`/`octokit.ts`. Корінь — що дефекти дійшли до fix пізно (Proposal 1). |
| lower concurrency 5 → 4 — 17 failures under load vs 15 alone | reject | Різниця 17 vs 15 — шум; «падіння» — проміжні `typecheck` на файлах сусіднього воркстріму (`Cannot find module './ExportWizard'`), які самі зникали без резюму. |
| (manual) route executable verification requests away from `researcher` | accept | R2: `researcher-guard` заборонив `node`; результат «Not tested». → Proposal 5. |

## Proposals
| # | Action | File | Change | Evidence | Expected effect |
|---|---|---|---|---|---|
| 1 | Edit | `.claude/agents/implementer.md` | Додати правило: репозиторій/міграція з сирим `sql\`…\``, `onConflict` або `selectDistinctOn` не здається, доки один раз не виконаний проти Docker Postgres (`*.it.test.ts` у тому ж воркстрімі), а в сирі шаблони `Date` не підставляється (див. `server/INSIGHTS.md` 2026-10-12). | W2b повідомив «SQL not run against Postgres»; W5 знайшов 500 на `POST /ci/refresh` (bug 1) і EC-9 лише після W2c; 3 з 4 resume W2c — наслідки. | −1 дефект «зелений hermetic, червоний на БД»; ≈ −1 resume W2c (13 → 12) |
| 2 | Edit | `.claude/agents/implementer.md`, `.claude/agents/test-writer.md` | Заборонити команди, що читають stdin без джерела (`cat > file` без heredoc/`< file`, `sed` без файла); додавати `</dev/null` до сумнівних. | W2a: `spanMin` 66.1 vs `activeMin` 6.6; `ps`: `cat` (дочірній до `58554`) 1 год 4 хв; користувач: «I see implementer is running». | −59 хв span; −1 питання користувача; прибирає хибний «running» |
| 3 | Edit | `.claude/agents/implementation-planner.md` | Якщо правило плану розгалужується за підтипом помилки (404 vs 403) — план називає поле, яким підтип проходить межу шарів (`details.status`), і тест, що це перевіряє. | Q6/EC-25 у плані; B2: адаптер зводить 403/404 до одного `github_permission`; баг-рев'ю знайшов, сервіс `ci/service.ts:413–421`. | Закриває клас B2; −1 fix-раунд W2c |
| 4 | Reorder | `.claude/agents/implementation-planner.md` | Для вільного тексту без `SPEC-NN` — після ≤ 5 прочитаних файлів повернути «потрібна специфікація — запустіть spec-creator» і зупинитися; планування після специфікації — **resume** того самого planner, а не новий. | planner #1: 93 053 fresh, 25 викликів, 3 хв, користувач замінив його на spec-creator о 16:11; топологія: 54 % перетину з planner #2. | −93 053 fresh (−1.4 %) і до −164 402 fresh на повторному читанні |
| 5 | Edit | `.claude/skills/spec-authoring/SKILL.md` («Running spec-creator») | Запити на виконання (`build`/`node`/`run`) не віддавати researcher: напряму `implementer` у scratch або `general-purpose`; у промпті research-request позначати `execute` vs `read`. | R2: `researcher-guard: node is not on the read-only allowlist` → «Not tested»; Q-2 залишився відкритим у spec і закритий W0 (+46 430 fresh). | −28 862 fresh (R2); Q-2 закрито на етапі spec, а не гейтом |
| 6 | Edit | `.claude/skills/run-plan/SKILL.md` | (a) Phase 2b: seed-значення брати з enum контракту (перевіряти `safeParse` до вставки), піднімати свої сервери лише на явно вільних портах і не вбивати процеси за патерном (`pkill -f`); (b) Phase 4 крок 4: записувати `review-round-(N+1).json` обов'язково; (c) дозволити зберігати повний звіт verifier (передавати йому шлях для запису через orchestrator `Write`) замість стислої копії. | Seed `verdict` поза enum → 500; `pkill` зупинив чужий сервер; немає `review-round-2/3.json`; `quality.sdd`: хибні `fail: 2` у verify-2. | Прибирає ≈ 2 хв/прогін простою та хибні метрики `quality.sdd`; повний audit trail |
| 7 | Edit | `.claude/skills/run-plan/SKILL.md` | У Phase 3 дозволити паралельний запуск verify #1 з reviewers лише коли ручна фаза 2b вже завершена, і додати в промпт verifier перелік відомих нефіксованих дефектів. | Цей прогін: verify і 3 reviewers у одному повідомленні (`19:17–19:18`), verifier довелося окремо інформувати; виграш у стінному часі. | Закріплює практику, яка заощадила стіновий час, замість «порушення порядку» |

Ефект із цифрою метрик: пропозиції 2, 4, 5 — прямі (−59 хв span, −93 053 fresh, −28 862 fresh). 1, 3, 6 — якісні (клас дефектів), оцінка в резюме/раундах, не в токенах.

## Applied (2026-10-13, за рішенням користувача: «всі»)
| # | Файл | Що додано |
|---|---|---|
| 1 | `.claude/agents/implementer.md` | абзац «DB-backed server code is not done until it has run on a real Postgres» (`.it` на кожен новий `sql`/`onConflict`/`selectDistinctOn`; заборона `Date` у сирому `sql`) |
| 2 | `.claude/agents/implementer.md`, `.claude/agents/test-writer.md` | правило «shell-команди не чекають stdin» |
| 3 | `.claude/agents/implementation-planner.md` | «Error subtypes across layer boundaries» у кроці 3 (поле-носій підтипу помилки + тест) |
| 4 | `.claude/agents/implementation-planner.md`, `.claude/skills/spec-authoring/SKILL.md` | «Free text without a spec — stop early» (≤ 5 файлів); «after a spec exists you are resumed»; крок 6 «Hand back» — resume того самого planner |
| 5 | `.claude/skills/spec-authoring/SKILL.md` | класифікація research-рядків `read`/`execute`; `execute` → implementer у scratch, не researcher |
| 6 | `.claude/skills/run-plan/SKILL.md` | Фаза 2b: seed з enum контракту + free ports + без `pkill -f`; Фаза 4 крок 4: завжди писати `review-round-(N+1).json`; Фаза 2: зберігати verify-звіт повністю |
| 7 | `.claude/skills/run-plan/SKILL.md` | Фаза 3 може йти в одному повідомленні з verify #1, якщо виміри 2b вже є; verifier отримує відомі нефіксовані дефекти |

Diff: 5 файлів, +101/−3 (`git diff --stat`). Ефект проявиться лише в наступних прогонах; порівнювати з цим ретро (fresh 6 535 899, active 70.7 хв, resumes 13).

## For engineering-insights (not recorded here)
У цій сесії вже записано 3 (сирий `Date` у `sql`; весь `dist/` runner; sr-only у скролері). Не записано через cap 3/сесію:
- `ciOctokit`: Octokit throttle-плагін засинає на rate limit; fail-fast `rate_limited` потребує окремого екземпляра (`server/src/adapters/github/octokit.ts`).
- `commitFiles.changed` порівнює дерево гілки з **base**, а не з parent: інакше повтор після невдалого PR не відкриває PR (EC-9).
- Процес: у спільних emdash-worktree dev-сервери інших гілок займають 3000/3001/3100/3101; перед `kill` перевіряти `cwd`, ніколи `pkill -f`.
- `cat > file` без джерела в команді агента зависає й тримає агента «running».
