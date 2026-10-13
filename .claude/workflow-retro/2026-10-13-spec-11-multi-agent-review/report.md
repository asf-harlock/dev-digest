# Workflow retro — SPEC-11 multi-agent review (2026-10-13)

Session `6375636f-5aee-4c4f-b575-373bd8e17fbb` · span 192,6 хв (16:05–19:18 UTC) · active оркестратора 49,8 хв · 15 агентів · max parallel 3
Збір із вікном `--until 2026-10-12T19:18:00Z`: ніч до самого ретро в числа не входить, і власний виклик ретро теж.

Що це за run: повний SDD-ланцюг в одній сесії: spec-creator (2 фази) → researcher ×3 ∥ → implementation-planner (2 фази) → `/run-plan` (W1 → W2 ∥ W3a ∥ W3b → verify #1 → W4a ∥ W4b → 3 рев'юери ∥ → 3 раунди fix/re-review → verify #2) → браузерна перевірка → insights.

## Numbers
| Actor | Model | Active min | Fresh tokens | Output | Cache read | Tools | Errors | Resumes |
|---|---|---|---|---|---|---|---|---|
| orchestrator | opus-5-5/sonnet-5-5 | 49.8 | 658,096 | 95,232 | 31,321,194 | 130 | 7 | - |
| 1. spec-creator - intake, spec, 2 revisions | sonnet-5-5 | 13.3 | 1,180,126 | 83,638 | 7,386,895 | 161 | 3 | 3 |
| 2. researcher - R1 prior L07 implementation in git | sonnet-5-5 | 1.5 | 91,988 | 105 | 660,991 | 44 | 0 | 0 |
| 3. researcher - R2 agent_runs readers | sonnet-5-5 | 2.4 | 119,303 | 283 | 1,594,299 | 32 | 4 | 0 |
| 4. researcher - R3 EventSource limits | sonnet-5-5 | 2.1 | 35,347 | 102 | 238,233 | 25 | 0 | 0 |
| 5. implementation-planner | sonnet-5-5 | 6.4 | 154,827 | 808 | 1,211,876 | 22 | 0 | 1 |
| 6. implementer - W1 contracts/schema/hooks | sonnet-5-5 | 2.2 | 105,808 | 241 | 1,243,880 | 23 | 1 | 0 |
| 7. implementer - W2 server | sonnet-5-5 | 4 | 130,467 | 3,782 | 2,551,746 | 33 | 1 | 0 |
| 8. implementer - W3a popover/Configure (+3 fix resumes) | sonnet-5-5 | 6.9 | 550,846 | 2,910 | 5,673,405 | 54 | 2 | 3 |
| 9. implementer - W3b results page | sonnet-5-5 | 5.3 | 119,059 | 1,028 | 2,531,877 | 37 | 3 | 0 |
| 10. plan-verifier - verify #1/#2 | sonnet-5-5 | 4.4 | 246,474 | 160 | 1,598,882 | 25 | 0 | 1 |
| 11. test-writer - W4a server | sonnet-5-5 | 6.6 | 145,483 | 291 | 2,547,256 | 32 | 0 | 0 |
| 12. test-writer - W4b client | sonnet-5-5 | 9.4 | 210,199 | 3,151 | 7,242,136 | 58 | 4 | 0 |
| 13. architecture-reviewer | sonnet-5-5 | 2.4 | 151,265 | 177 | 851,883 | 21 | 1 | 2 |
| 14. security-reviewer | sonnet-5-5 | 1.1 | 76,453 | 441 | 769,088 | 18 | 2 | 0 |
| 15. general-purpose - bug review | sonnet-5-5 | 2.3 | 128,001 | 274 | 2,222,179 | 26 | 0 | 0 |
| **Total** | | | 4,103,742 | 192,623 | 69,645,820 | | 28 | 10 |

Orchestrator share of fresh tokens: 0.16 (658,096 з 4,103,742). Оркестратор: 22 виклики на Opus (spec-фаза), 112 на Sonnet після `/model sonnet` о 18:29.
`cache_read` окремо й дешевий: це переважно той самий контекст, що перечитується щоразу; у "tokens spent" його не додаю.

## Outcome
| Gate | Runs | Fails | First try | Final |
|---|---|---|---|---|
| lint-spec.mjs | 3 | 0 | yes | yes |
| scripts/check.sh | 25 | 9 | no | yes |
| tsc | 2 | 1 | yes | no |
| vitest | 2 | 1 | yes | no |

Читати обережно: скрипт визначає gate за командою й pass/fail за хвостом виводу. Рядки `tsc` і `vitest` із "final: no" — це евристика, не провал. Другий `vitest` — команда `grep -n …` verifier-а, де `vitest` стоїть у наступному сегменті, а `tsc` — тимчасовий tsconfig test-writer-а (прибраний), у фінальному звіті "no errors". Фактично на кінець run: client typecheck/lint/arch/test PASS (865), server typecheck/lint/arch PASS, test 900-901 (1 baseline-флейк `project-context` NFR-2 за часом), `multi-agent.it.test` 16/16.

Із 9 невдалих `scripts/check.sh` 4 — baseline/середовище, не код цієї зміни: `core:test` (18:30, немає vitest), `server typecheck` двічі (18:37, 18:39: 8 помилок у `reviewer-core/src/llm/*` через відсутній `reviewer-core/node_modules`), флейк `project-context` (19:12). Решта: `repoName` unused (W3a), застарілий тест NAV AC-1 (очікувано за AC-8), unused import у тесті W4b, невдала команда оркестратора/рев'юера (`=====` у zsh).

`/run-plan` стан: verify rounds 2, review rounds 3 (раунд 1: 3 WARNING + 2 SUGGESTION; раунд 2: +A4 WARNING). Лічильники Pass/Fail у `quality.sdd.verify` показують 0/0/0/0 для обох файлів: `verify-1.md` і `verify-2.md` я зберіг стислими (без рядків матриці), тож скрипт нічого не порахував. Це знахідка оркестратора (нижче).
Resumes: 10 · errors за видами: exit 13, other 13, denied 1, missing-path 1.

## Trend
Порівнянні run-и (той самий склад: planner, implementers, test-writers, verifier, reviewers): SPEC-07, SPEC-09, SPEC-10.
- Fresh tokens: 4 103 742 проти 5 642 413 (SPEC-10): Δ −1 538 671 (−27%); проти 4 551 563 (SPEC-09): Δ −447 821 (−10%).
- Active: 49,8 хв (оркестратор) проти 50,2 (SPEC-10) та 49,2 (SPEC-09): Δ −0,4. Не впевнений, що поле `activeMin` в історії рахується так само, тому це грубе порівняння.
- Resumes: 10 проти 12 (SPEC-10), 5 (SPEC-09): Δ −2 / +5.
- Gates first-try: 3 з 4 видів gate (check.sh не з першого разу), як у SPEC-10 (3/4); SPEC-09 4/4.
- Orchestrator share: 0,16 проти 0,07 (SPEC-10), 0,11 (SPEC-09), 0,23 (SPEC-07): Δ +0,09 до SPEC-10. Причина в частині власної роботи оркестратора (див. "Orchestrator").
- Errors: 28 проти 8 (SPEC-10), 14 (SPEC-09): Δ +20 до SPEC-10. 13 із них `exit` — це червоні gate-и (4 з них baseline), а 13 `other` — більшість у браузерній перевірці й у researcher-guard.

## Order
1. 16:05 spec-creator (фаза 1, нічого не пише).
2. 16:12 researcher R1 ∥ R2 ∥ R3 в одному повідомленні; усі три відпрацювали за 1,4–2,4 хв (перевірено `spanMin`).
3. 16:14→18:10: очікування користувача (115,6 хв): 11 питань із defaults, відповідь прийшла лише як додаткова вимога (RunTraceDrawer). Spec-фазу 2 оркестратор запустив одразу з defaults.
4. 18:11 resume spec-creator (фаза 2: запис spec). 18:17 implementation-planner (фаза 1).
5. 18:20 питання користувачу (nav.ts, findings, режим, статус спеки), відповідь за ~2 хв; 18:22 resume spec-creator (ревізія), 18:24 resume planner (план).
6. 18:31 W1 implementer (2,2 хв), потім 18:33 W2 ∥ W3a ∥ W3b в одному повідомленні.
7. 18:39 verify #1 (фоном) і питання про міграцію + тести (6 хв очікування, відповідь 18:45).
8. 18:45 W4a test-writer, 18:46 W4b test-writer + resume W3a (F1).
9. 18:56 architecture ∥ security ∥ bug reviewer в одному повідомленні.
10. 19:04–19:12: триаж (A1/A2/M1/F2 і A4: два питання), resume W3a ×2, resume spec-creator (EC-12), resume architecture-reviewer ×2, resume verifier (verify #2).
11. 19:14 engineering-insights, 19:17 питання користувача про verifier.

Що чекало на користувача: пункт 3 (115,6 хв), 6 хв у п. 7, ~2 хв у п. 5 і п. 10. Що можна було запустити раніше: W4a (див. Proposal 4).

## Per agent
### 1. spec-creator — intake, spec, 2 revisions
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue | Найдорожчий агент: 1,180,126 (29%) fresh, 3 resumes (flag підтверджено: фаза 2 за задумом + 2 ревізії, не "нова робота"); модель `sonnet-5-5`, не top-tier, тож flag про модель не стосується |
| Hard | issue | 3 помилки: PCRE look-around у Grep відхилено; 2 `Edit` "String to replace not found" (AC-40/EC-20); spec 510 рядків і 44 Edit-виклики в ревізіях |
| Easy | ok | Перший звіт зробив точну таблицю "існує проти припущено" (послідовний executor, порожня `multi_agent_runs`, відсутня евристика) з file:line; чотири phase-2 звіти пройшли lint з першої спроби (`lint-spec.mjs` 3/3) |
| Duplicated | ok | `INSIGHTS.md` двічі, 49 файлів прочитано; спільні читання (`observability.ts`, `runs.ts`, `server/CLAUDE.md`) з planner і implementers: кожен агент читає власний контекст, це очікувано |
| Missed | issue | Planner у фазі 1 знайшов 4 блокери, яких spec не мав: Q-B (`nav.ts` у vendor, Do-not-touch), Q-C (`AgentColumnFinding` без полів `FindingRecord`), Q-D (nullable `agent_id`, `ConflictTake.run_id`/`dismissed`), Q-A. Це resume #2 (18:22). EC-12 проти AC-39 вилізло лише на verify #1 → resume #3 (19:06) |
| Hand-off | issue | 4 hand-back-и, 38 724 символи; перший звіт: 24 знахідки й 11 питань. Користувач прямо не відповів на жодне (`timeline`: 18:10 лише додаткова вимога) |
| Prompt | ok | 6 001 символ, 5 скриншотів і вимоги дано; тіло spec написане англійською, про що агент сам попередив |

### 2. researcher — R1 prior L07 implementation in git
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 91 988 fresh, 1,5 хв, 13 викликів |
| Hard | ok | 0 помилок |
| Easy | ok | Знайшов дві повні попередні реалізації V1 `d65779f` і V2 `15c8506` лише на `upstream/*` і процитував правило конфліктів; це змінило spec (V2 за основу) |
| Duplicated | n/a | не перетинався з іншими |
| Missed | ok | "Could not determine" (agent-runner гілки) не знадобилось далі |
| Hand-off | ok | 14 616 символів; оркестратор передав spec-creator ключове правило, не весь звіт |
| Prompt | ok | 1 102 символи, конкретні `git`-команди |

### 3. researcher — R2 agent_runs readers
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 119 303 fresh, 2,4 хв |
| Hard | issue | 4 помилки: `Grep` недоступний у сесії (1) і `researcher-guard` відхилив command substitution (3) |
| Easy | ok | Вердикт по кожному споживачу `agent_runs`, жодного хибного "double-count" |
| Duplicated | issue | rereads: `run-repo.test.ts` ×3, `eval/repository.ts` ×3, `observability.ts` ×3 |
| Missed | ok | її висновки (FK `SET NULL`, агрегати з дочірніх) повністю в spec |
| Hand-off | ok | 16 339 символів, передано стисло |
| Prompt | ok | 1 091 символ |

### 4. researcher — R3 EventSource limits
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 35 347 fresh, 19 WebFetch + 5 WebSearch, 2,1 хв, 0 помилок |
| Hard | ok | Safari не підтверджено: чесно в "Could not determine" |
| Easy | ok | Висновок "опитування + максимум один SSE" став NFR-4 |
| Duplicated | n/a | зовнішнє дослідження |
| Missed | ok | |
| Hand-off | ok | 9 456 символів, передано трьома пунктами |
| Prompt | ok | 893 символи |

### 5. implementation-planner
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 154 827 fresh, 6,4 хв, 17 викликів, 1 resume за задумом (дві фази) |
| Hard | ok | 0 помилок |
| Easy | ok | Фаза 1 знайшла 4 блокери (Q-A…Q-D) і запропонував режим; 26 кроків із файловими межами без перетину |
| Duplicated | issue | rereads: `specs/11…` ×2, `observability.ts` ×2, `runs.ts` ×2, `run-executor.ts` ×2, `service.ts` ×2 |
| Missed | issue | Не перевірив `.dependency-cruiser.cjs` для `reviews/multi-agent/routes.ts` (W2 мусив обходити правило → A3); крок 25 передбачав "тимчасові SQL-дані" у спільній БД (спроба запису заблокована 18:58) |
| Hand-off | ok | 15 314 символів; припущення A1…A5 названі окремо |
| Prompt | ok | 2 375 символів |

### 6. implementer — W1 contracts/schema/hooks
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 105 808 fresh, 2,2 хв |
| Hard | issue | `server typecheck` 8 помилок і `core typecheck` ENV; "could not diff against the base without `git stash`" |
| Easy | ok | Обидві vendor-копії контрактів байт-ідентичні; hooks 95 + 45 тестів зелені |
| Duplicated | n/a | |
| Missed | ok | verify #1: кроки 1-4 Pass |
| Hand-off | ok | Назвав два gate-и, які не міг виправити, і не приховав |
| Prompt | issue | Baseline оркестратора містив лише `test`-gate-и, тож агент не мав змоги відрізнити typecheck-baseline від власної вини |

### 7. implementer — W2 server
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 130 467 fresh, 4 хв |
| Hard | issue | `http-framework-only-in-routes` приймає лише `<module>/routes.ts`; вкладений `multi-agent/routes.ts` обійшов правило через `Parameters<typeof reviewsRoutes>[0]` |
| Easy | ok | 29 викликів; `lint`, `arch`, `related` зелені; 53 + 16 тестів W4a знайшли 0 дефектів у його коді |
| Duplicated | ok | |
| Missed | issue | Обхід став A3 (SUGGESTION): прогалина плану, не вина агента |
| Hand-off | ok | Перелічив 8 відхилень і рішень, зокрема відомий race двох POST |
| Prompt | ok | |

### 8. implementer — W3a popover/Configure (+3 fix resumes)
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue | 550,846 (13%) fresh, 6,9 хв active, span 37 хв; flag "3 resumes" підтверджено: усі три — Fix mode (F1; A2+M1; A4), не нова робота |
| Hard | issue | Виправлення M1 замінило kit `SelectInput` на рукописний `<select>`, і це стало A4 (WARNING) та колапсувало до 0 px на 390 px |
| Easy | ok | Конфіг, nav і посилання в Timeline (кроки 10, 11, 13, 14, 15) Pass без правок |
| Duplicated | n/a | |
| Missed | issue | F1: попап без агрегованої оцінки (AC-7/EC-7; крок 11 казав "popover і Configure"), M1 (select 616 px у рамці 520), A2 (cross-route імпорт хелперів) |
| Hand-off | issue | Двічі звітував, що `client typecheck` падає на "7 помилках W3b": це був проміжний стан спільного дерева, мій повторний прогін дав PASS |
| Prompt | ok | дизайни передано шляхами, межі файлів чіткі |

### 9. implementer — W3b results page
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 119 059 fresh, 5,3 хв |
| Hard | ok | 3 помилки в інструментах, жодного провального gate |
| Easy | ok | 6 кроків і 8 нових папок компонентів за один прохід; typecheck/lint/arch PASS; у браузері дефектів у його файлах не знайдено, лише питання spec (F2) |
| Duplicated | n/a | |
| Missed | ok | |
| Hand-off | ok | сам позначив "Workstream too large" і все ж завершив |
| Prompt | ok | |

### 10. plan-verifier — verify #1/#2
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 246 474 fresh, 1 resume (verify #2 як дельта-матриця) |
| Hard | ok | 0 помилок |
| Easy | ok | Verify #1 знайшов 2 реальних Fail (F1 дефект коду, F2 неоднозначність spec); `Pass on caller's evidence` застосував правильно |
| Duplicated | ok | `check.sh` ×9: повторний прогін gate-ів за дизайном |
| Missed | issue | У verify #2 `catch {}` в `RunReviewDropdown.kick` лишився Unverified, хоча bug-reviewer підтвердив `providers.tsx:41-43` |
| Hand-off | issue | Матриці довгі й повертаються лише в чаті (немає `Write`); оркестратор зберіг стислі версії |
| Prompt | issue | Prompt verify #2 не містив висновків рев'юерів |

### 11. test-writer — W4a server
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 145 483 fresh, 6,6 хв, 0 помилок |
| Hard | ok | |
| Easy | ok | 69 тестів (53 hermetic + 16 `.it`) за три прогони без флейків; контрольований promise замість `setTimeout` |
| Duplicated | issue | Spec прочитано ×8 одним агентом (`sharedReads`) |
| Missed | ok | |
| Hand-off | ok | |
| Prompt | ok | власні файли названо |

### 12. test-writer — W4b client
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 210 199 fresh, 9,4 хв, 51 виклик |
| Hard | issue | 4 помилки: unused-змінна в тесті, що провалила lint, і тимчасовий tsconfig без типів `node` |
| Easy | ok | 865 тестів клієнта зелені, застарілий тест `app-shell/helpers.test.ts` оновлено, а не видалено |
| Duplicated | ok | |
| Missed | ok | |
| Hand-off | ok | сам позначив `client/src/test/multi-agent-fixtures.ts` як файл поза списком власності |
| Prompt | ok | |

### 13. architecture-reviewer
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 151 265 fresh, flag "2 resumes" відхилено: це re-review раундів 2 і 3 за дизайном `/run-plan`, і вони дешеві (2,4 хв active) |
| Hard | ok | 1 помилка команди |
| Easy | ok | Відповів на обидва поставлених питання (nested routes, cross-route import) із посиланням на правило |
| Duplicated | ok | `findings.md` читають усі три рев'юери: очікувано |
| Missed | ok | A4 піймав у раунді 2 на рядках виправлення |
| Hand-off | issue | Перший елемент `findings-json` раунду 2 мав зіпсований title ("(still open: A2) not applicable…"); оркестратор перейменував у A4 |
| Prompt | ok | |

### 14. security-reviewer
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 76 453 fresh, 1,1 хв; запуск за правилом (spec має UI-n і diff чіпає `server/src/modules/**`) |
| Hard | ok | 2 помилки інструментів |
| Easy | ok | Перелік перевірених sink-ів (tenancy, Markdown, `trace` param) із file:line; `findings: []` |
| Duplicated | ok | |
| Missed | ok | |
| Hand-off | ok | |
| Prompt | ok | |

### 15. general-purpose — bug review
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 128 001 fresh, 2,3 хв |
| Hard | ok | |
| Easy | ok | Перевірив усі названі мною місця; дві підпорогові спостереження (race 409 ≈0,4; `files_count` backfill) |
| Duplicated | ok | |
| Missed | ok | жодної знахідки після браузерної перевірки не знайшлося у його зоні |
| Hand-off | ok | |
| Prompt | ok | назвав точкові ризики, що відповідає rubric |

### Orchestrator
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 22 виклики на Opus (spec-фаза) і 112 на Sonnet; fresh 658,096 |
| Hard | issue | 7 помилок: 1 `denied` (спроба запису в спільний Postgres, "Modify Shared Resources", 18:58:27), 3 тайм-аути Playwright по 30 с (Escape не закриває `RunTraceDrawer`; dev-сервер клієнта зупинився), 1 `File access denied` (mock.js поза дозволеними коренями), 1 `missing-path` (скриншот без каталогу потрапив у корінь репозиторію, видалено) |
| Easy | ok | Паралельні запуски R1–R3, W2 ∥ W3a ∥ W3b, 3 рев'юери; resume того самого рев'юера й verifier-а, а не нові агенти |
| Duplicated | issue | `scripts/check.sh` ×4 у `sharedReads` оркестратора (евристика: насправді одне читання usage і кілька запусків); повні `client all`/`server all` оркестратор запускав 3 рази, потім verifier ще раз |
| Missed | issue | Baseline Phase 0 запустив лише `test`: typecheck-baseline відсутній, і W1/W2 обидва зіткнулись із 8 помилками без контексту |
| Order | issue | W2 завершився о 18:37:41, W4a стартував 18:45:54 (8 хв): питання про тести лишилось текстом без відповіді й було поставлене знову о 18:39 |
| Relays | issue | `verify-1.md`/`verify-2.md` збережено стислими, тож `quality.sdd.verify` = 0/0/0/0; prompt verify #2 без висновків bug-reviewer |
| Own work | issue | Браузерна перевірка: 14 `run_code_unsafe` із повним виводом коду скрипта в кожній відповіді; піднято сервери на 3100/3101 (3000/3001 зайняті іншим checkout), виконано `npm ci` у `reviewer-core` |
| User time | issue | 115,6 хв очікування після intake: 11 питань мали default, відповіді не було |

## Duplication
- `specs/11-multi-agent-review.md`: orchestrator ×1, spec-creator ×1, planner ×2, W2 ×5, W3a ×1, verifier ×1, W4a ×8. Читають усі, кому вона потрібна; W4a ×8 надлишково.
- `server/src/vendor/shared/contracts/observability.ts`: 8 акторів (R2 ×3, planner ×2, W2 ×2): очікувано для контрактної зміни.
- `scripts/check.sh`: orchestrator ×4, verifier ×9, test-writer ×4. Евристика ловить запуски як читання.
- `INSIGHTS.md` (root/server/client): orchestrator ×1, spec-creator ×1–2, planner ×1–2. Один факт (`reviewer-core` без `node_modules`) знайдено окремо в W1, W2 і в оркестратора.
- Той самий факт у двох звітах: "8 помилок typecheck у `reviewer-core/src/llm/*`" — W1 і W2.

## Topology
| Candidate | Verdict | Reason |
|---|---|---|
| split spec-creator:aacd960 — a fresh agent per phase/layer, resume only for fixes (3 resumes, 26% of fresh tokens) | reject | Resume #1 — це фаза 2 за дизайном, #2 і #3 — ревізії того самого файлу; свіжий агент перечитав би ≈49 файлів (`filesRead` 49) і втратив би контекст рішень. Витрати великі, але причина — розмір spec і 44 Edit, а не топологія |
| split implementer:aef1c3b — a fresh agent per phase/layer, resume only for fixes (3 resumes, 12% of fresh tokens) | reject | Усі три resumes були саме Fix mode, на що й радить candidate ("resume only for fixes"); проблема не в топології, а в тому, що друге виправлення внесло нове порушення (Proposal 3) |
| (manual) security-reviewer і bug-reviewer залишити окремо | accept | Незалежні перевірки одного diff, об'єднувати не можна |

## Proposals
| # | Action | File | Change | Evidence | Expected effect |
|---|---|---|---|---|---|
| 1 | Edit | `.claude/skills/run-plan/SKILL.md` | Phase 0 крок 3: baseline запускає ВСІ gate-и з Test plan плану (typecheck, lint, arch, test) і перевіряє залежності (`reviewer-core/node_modules` відсутній → `npm ci`) до Phase 1 | W1 (18:33) і W2 (18:37) отримали 8 однакових помилок `server typecheck` і не змогли відрізнити їх від власних; оркестратор знайшов причину лише тоді, коли API не стартував (`ERR_MODULE_NOT_FOUND: openai`) | −4 з 9 невдалих `check.sh` (core:test, server typecheck ×2, флейк) і 2 неоднозначні hand-back-и |
| 2 | Edit | `.claude/skills/run-plan/SKILL.md` | Phase 2b: для стану "немає даних" використовувати `page.route` або наявні рядки; не писати тимчасові дані в спільний `devdigest-postgres`; Playwright читає файли лише з worktree і `.playwright-mcp`; dev-сервери запускати через `run_in_background` | Запис у БД заблоковано 18:58:27; 3 тайм-аути по 30 с; сервер клієнта зупинився посеред перевірки; скриншот без каталогу потрапив у корінь репозиторію | −1 denied, −3 тайм-аути (≈1,5 хв), −1 перезапуск сервера |
| 3 | Edit | `.claude/agents/implementer.md` | Fix mode: перед заміною kit-контролу власним — звірити `client/docs/component-conventions.md` ("Generic input → vendor/ui"); якщо vendor read-only, повернути блокер, а не перереалізовувати | M1 → рукописний `<select>` → A4 (WARNING) → ще один fix-раунд і re-review; нативний select колапсував до 0 px на 390 px | −1 resume W3a (`aef1c3b`) і −1 resume architecture-reviewer (`a55cabf`) |
| 4 | Edit | `.claude/skills/run-plan/SKILL.md` | Phase 0 крок 4: питання про `test-writer` ставити через AskUserQuestion одразу (не текстом) або, за наявності W4 у плані без `--tests`, стартувати серверний `test-writer`, щойно завершився W2 | W2 завершився 18:37:41, W4a стартував 18:45:54 | −8 хв на критичному шляху |
| 5 | Edit | `.claude/skills/run-plan/SKILL.md` | Phase 2/5: зберігати відповідь verifier-а дослівно і передавати в prompt verify #2 висновки рев'юерів | `quality.sdd.verify` = 0/0/0/0 для обох файлів; `catch {}` лишився Unverified попри `providers.tsx:41-43` у звіті bug-reviewer | відновлені 2 рядки ledger, −1 Unverified |
| 6 | Edit | `.claude/agents/spec-creator.md` | Додати контрольний список: для кожного AC/UI, що показує поле, записати поле контракту, nullability і vendor/Do-not-touch файл, якого зміна торкнеться (як `nav.ts`) | Планувальник знайшов Q-B, Q-C, Q-D; spec-creator resume #2 о 18:22; аналогічний висновок у root `INSIGHTS.md` 2026-10-02 | −1 resume spec-creator (`aacd960`) |
| 7 | Edit | `.claude/agents/implementation-planner.md` | Для нового файлу під `modules/<m>/<sub>/` перевірити правила `.dependency-cruiser.cjs` (`http-framework-only-in-routes` дозволяє лише `<module>/routes.ts`) і записати дозволене розміщення або потрібне схвалення | W2 обійшов правило → A3 (SUGGESTION), відкрите й досі | закриває 1 SUGGESTION і 1 відхилення W2 |

## For engineering-insights (not recorded here)
- `devdigest-postgres` спільний для різних checkout-ів і worktree: міграція з одного worktree видна в іншому (адитивна nullable-колонка безпечна).
- `RunTraceDrawer` не закривається клавішею Escape: у Playwright кліки під оверлеєм блокуються.
- Playwright MCP читає файли лише в корені worktree і `.playwright-mcp`; скриншот із `filename` без каталогу лягає в корінь репозиторію.
- dev-сервер, запущений через `nohup` у підоболонці виклику інструмента, зупиняється разом із сесією: `run_in_background` працює стабільніше.
