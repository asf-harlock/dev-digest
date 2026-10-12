# Workflow retro — SPEC-10 `/run-plan` (Phase A + Phase B) (2026-10-12)

Session `66f3ac55-fc00-477a-aa86-f1253d9a8776` · window from 2026-10-12T09:05Z · span 121.6 min · active (orchestrator) 50.2 min · 18 agents · max parallel 4
Numbers include this retro's first call. Вікно починається з `/run-plan`: spec-creator, 3 researcher-и і implementation-planner (08:00–09:04Z) **не** входять у цифри — `n/a — поза вікном`.

## Numbers
| Actor | Model | Active min | Fresh tokens | Output | Cache read | Tools | Errors | Resumes |
|---|---|---|---|---|---|---|---|---|
| orchestrator | sonnet-5-5 | 50.2 | 371,889 | 90,024 | 49,440,088 | 168 | 4 | — |
| 1. implementer — W1-A contracts | sonnet | 1.1 | 52,453 | 6,263 | 390,632 | 17 | 0 | 0 |
| 2. implementer — W2-A server | sonnet | 4.8 | 472,352 | 2,170 | 3,832,402 | 54 | 0 | 2 |
| 3. implementer — W3-A client | sonnet | 25.4 | 1,716,864 | 3,585 | 29,854,668 | 112 | 1 | 4 |
| 4. plan-verifier — Verify #1 Phase A | sonnet | 4.4 | 171,927 | 229 | 2,834,999 | 30 | 0 | 0 |
| 5. plan-verifier — Re-verify AC-25 | sonnet | 1.1 | 34,969 | 116 | 269,175 | 12 | 0 | 0 |
| 6. architecture-reviewer — Phase A | sonnet | 1.0 | 54,023 | 59 | 222,598 | 13 | 0 | 0 |
| 7. general-purpose — Bug review Phase A | sonnet | 5.6 | 439,618 | 975 | 6,077,114 | 44 | 0 | 2 |
| 8. security-reviewer — Phase A | sonnet | 1.5 | 185,369 | 131 | 905,628 | 19 | 0 | 1 |
| 9. plan-verifier — Verify #2 Phase A | sonnet | 2.8 | 51,714 | 602 | 414,726 | 20 | 0 | 0 |
| 10. implementer — W1-B contracts+schema+migration | sonnet | 0.9 | 41,033 | 387 | 297,487 | 12 | 0 | 0 |
| 11. implementer — W2-B server | sonnet | 7.4 | 246,329 | 1,557 | 8,021,981 | 54 | 2 | 0 |
| 12. implementer — W3-B client | sonnet | 17.3 | 575,316 | 1,169 | 18,150,453 | 98 | 1 | 2 |
| 13. test-writer — W4-B | sonnet | 18.3 | 491,689 | 14,624 | 22,555,092 | 99 | 0 | 0 |
| 14. plan-verifier — Verify #1 Phase B | sonnet | 5.3 | 207,200 | 1,252 | 7,111,870 | 57 | 0 | 0 |
| 15. architecture-reviewer — Phase B | sonnet | 1.2 | 44,289 | 333 | 305,352 | 15 | 0 | 0 |
| 16. general-purpose — Bug review Phase B | sonnet | 4.7 | 372,226 | 601 | 4,839,672 | 45 | 0 | 1 |
| 17. security-reviewer — Phase B | sonnet | 1.3 | 72,772 | 225 | 859,528 | 21 | 0 | 0 |
| 18. plan-verifier — Verify #2 Phase B | sonnet | 2.1 | 40,381 | 368 | 198,953 | 14 | 0 | 0 |
| **Total** | | | **5,642,413** | **124,670** | 156,582,418 | | **8** | **12** |

Orchestrator share of fresh tokens: 0.07. Усі агенти запущені з явним `model: "sonnet"`; сесія теж на Sonnet.

## Outcome
| Gate | Runs | Fails | First try | Final |
|---|---|---|---|---|
| `scripts/check.sh` | 26 | 8 | yes | yes |
| `vitest` | 35 | 15 | no | no |
| `pnpm arch` | 2 | 0 | yes | yes |
| `tsc` | 1 | 0 | yes | yes |

`vitest` final=no: останній повний прогін `.it.test` містить 5 baseline-падінь на чистому дереві (`skills-stats` ×4, `skills` '404s…') і флейки під навантаженням (`onboarding-tour`, `context-run`); усі eval-IT (`eval-case-run`, `eval-draft`, `eval-cases`, `skill-eval*`) зелені. 8 фейлів `check.sh` — це очікувані зриви типізації/фікстур після нових обов'язкових полів `scope`/`running_case_run` (W2-B, 10:23–10:24Z), виправлені тим самим агентом.

SDD (`quality.sdd`): `verify-1.md` — 53 Pass / 0 Fail / 8 Unverified; `verify-2.md` — 10 / 0 / 0 (дельта-матриця, згорнуті рядки рахуються групою); `verify-3.md` — n/a (парсер прочитав 0 рядків: файл збережено оркестратором як підсумок, а не матрицю). Verifier-Fail рядки: Phase A — AC-25 (title губиться у PATCH), Phase B — EC-23/EC-24/AC-42 у модалці; обидва виправлені. Review rounds: round 1 — 5 findings (1 CRITICAL, 4 WARNING), round 2 — 1 WARNING (B3), round 3 (Phase B) — 1 WARNING (B5).
Resumes: 12 · errors: `other` 4, `exit` 4.

## Trend
Порівняння з останніми `/run-plan` ранами (набір агентів частково різний: цей додає test-writer і дві фази; SPEC-08/09 — одна фаза):
- Fresh tokens: 5,642,413 vs SPEC-09 4,551,563 (**+1,090,850, +24%**) vs SPEC-08 4,138,990 (+1,503,423).
- Active min (orchestrator): 50.2 vs 49.2 (+1.0) vs 28 (+22.2); span 121.6.
- Resumes: 12 vs 5 (**+7**) vs 7 (+5).
- Gates first-try: 3 з 4 vs 4 з 4 vs 7 з 9.
- Orchestrator share: 0.07 vs 0.11 (−0.04) vs 0.14 (−0.07).

## Order
Launch order з timestamp (Z):
1. 09:12 W1-A contracts → **09:13–09:14 W2-A ∥ W3-A** (залежність від W1-A; паралельно).
2. W2-A готовий ~09:18; чекали на W3-A до ~09:36 (критичний шлях: W3-A, 25.4 min active, span 57.6).
3. 09:37 Verify #1 Phase A; 09:41 два resume-fix (F1, портал) паралельно.
4. **09:44 Re-verify AC-25 ∥ architecture ∥ bug ∥ security** (одним повідомленням).
5. 09:49–10:12 fix-цикл: B1 → (B2 ∥ S1/B3/B4) → re-review ×2 → B3 → re-review round 3; 10:12 Verify #2 Phase A; Phase A закомічена.
6. 10:15 W1-B → **10:19 W2-B ∥ W3-B**; 10:32 test-writer (чекав завершення обох); 10:33 resume M1 (ширина модалки).
7. **10:52 Verify #1 ∥ architecture ∥ bug ∥ security** Phase B; 10:57 resume B5; 11:01 re-review; 11:02 Verify #2 Phase B.
Очікування користувача: 4 AskUserQuestion (09:10, 10:16, 10:19, 10:50) — відповіді прийшли швидко, окремого простою в числах немає (span − active = 71.4 min майже цілком — час роботи агентів у фоні).

## Per agent
### 1. implementer — W1-A contracts
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 52k fresh, 11 calls, 1.1 min; відокремлений W1 потрібен, бо правки vendor вимагають окремої згоди |
| Hard | ok | `EvalFindingLabel`/`EvalActualFinding`/`EvalCaseEffect` довелося підняти вище за `EvalCaseLatestResult` |
| Easy | ok | parity-тест зелений з першого разу |
| Duplicated | ok | 2 перечитування vendor-файлів (по одному на копію) |
| Missed | ok | нічого пізніше не повернулося до контрактів Phase A |
| Hand-off | ok | чітка таблиця змін + зауваження про `skill_id` vs `id` |
| Prompt | ok | точні кроки A1–A2 |

### 2. implementer — W2-A server
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 472k fresh, 4.8 min active |
| Hard | ok | жодних помилок; 5 рішень-неоднозначностей чесно винесено у звіт |
| Easy | ok | усі гейти зелені з першого прогону |
| Duplicated | ok | `service.ts`/`repository.ts` ×3 — власні правки |
| Missed | issue | F1 (title у PATCH, AC-25) і B2 (draft ground-иться з `kind`, Save — без) знайшли verifier і bug-reviewer; implementer сам ухвалив рішення «title persist лише на create» і позначив це як deviation, але не зв'язав з PATCH |
| Hand-off | ok | чіткий список «що W4 має додати» |
| Prompt | ok | 2 resumes, обидва — fix-режим |

### 3. implementer — W3-A client
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue | 1,716,864 fresh = 30% від run, 112 tool calls, span 57.6 min: один агент на 8 кроків (A11–A18: хуки, переписаний editor із 5 під-компонентами, 2 таби, SkillEvalMenu, i18n) |
| Hard | issue | `git stash`/`stash pop` у спільному дереві під час паралельного W2-A (власний звіт: «for roughly 2 seconds… if W2-A saw a transient file revert, that was me»); заблокований `sleep` |
| Easy | ok | усі 4 клієнтські гейти зелені на кінець |
| Duplicated | issue | `scripts/check.sh` ×3 читань; 29.8M cache_read |
| Missed | issue | portal-дефект (модалка в muted-картці), B1 CRITICAL (кнопка skeleton сабмітить форму), B3, B4, S1 — усе знайдено після hand-back |
| Hand-off | ok | детальний звіт із 11 пунктами deviations; A22 чесно позначено «not done» |
| Prompt | ok | 4 resumes, усі fix-режим |

### 4. plan-verifier — Verify #1 Phase A
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 172k fresh |
| Hard | ok | без помилок |
| Easy | ok | матриця збережена у `verify-1.md`, один реальний Fail (AC-25) |
| Duplicated | issue | перечитав `plan.md`, spec і ті самі файли, які потім читали ще 3 верифікатори (`sharedReads` plan.md: 10 акторів) |
| Missed | issue | не мав браузера — не міг спіймати opacity/ширину; A22 лишив «Unverified» |
| Hand-off | ok | verdict-рядок + лише non-Pass рядки |
| Prompt | ok | детальний список перевірок |

### 5. plan-verifier — Re-verify AC-25
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 35k fresh, 1.1 min |
| Hard | ok | tsx-трасування `classifyEdit` |
| Easy | ok | Fail → Pass |
| Duplicated | issue | свіжий запуск замість resume #4 (60% спільного набору читань) |
| Missed | ok | вказав gap «немає тесту на PATCH title» — закрито test-writer-ом у Phase B |
| Hand-off | ok | таблиця випадків |
| Prompt | ok | — |

### 6. architecture-reviewer — Phase A
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 54k fresh, 1 min, обидва `pnpm arch` як machine gate |
| Hard | ok | — |
| Easy | ok | 0 findings, чіткий «Grounding note» |
| Duplicated | ok | — |
| Missed | ok | жодних архітектурних зауважень пізніше |
| Hand-off | ok | findings-json порожній |
| Prompt | ok | — |

### 7. general-purpose — Bug review Phase A
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 440k fresh — найцінніший рев'ювер: B1 CRITICAL (підтверджено оркестратором у `Button.tsx:69`), B2, B3, B4 |
| Hard | ok | 42 tool calls на конкретні трасування |
| Easy | ok | re-review resume ×2 за ~30 с активного часу кожен |
| Duplicated | ok | — |
| Missed | issue | не помітив portal/opacity (потрібен був візуальний рендер) |
| Hand-off | ok | таблиця + failing input |
| Prompt | ok | hot spots у промті справді допомогли |

### 8. security-reviewer — Phase A
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 185k fresh |
| Hard | ok | — |
| Easy | ok | 1 WARNING (S1) із хорошою репродукцією, 0 після re-review |
| Duplicated | ok | — |
| Missed | ok | — |
| Hand-off | ok | — |
| Prompt | ok | 1 resume для re-review |

### 9. plan-verifier — Verify #2 Phase A
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 52k fresh, дельта-матриця |
| Hard | ok | — |
| Easy | ok | 0 Fail |
| Duplicated | issue | свіжий запуск замість resume #4 (50% спільного набору читань) |
| Missed | ok | — |
| Hand-off | ok | перелік «Lacking an automated test because W4-A was not created» дав готовий бриф для test-writer |
| Prompt | ok | — |

### 10. implementer — W1-B contracts + schema + migration
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 41k fresh, 0.9 min |
| Hard | ok | — |
| Easy | ok | згенерована міграція — рівно один `ALTER TABLE … ADD COLUMN` |
| Duplicated | ok | — |
| Missed | ok | зафіксував «не застосовувати міграцію» — оркестратор спитав користувача |
| Hand-off | ok | точний список зламаних файлів для W2-B/W3-B |
| Prompt | ok | — |

### 11. implementer — W2-B server
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 246k fresh, 7.4 min — 8 кроків (B4–B10) значно ефективніше за клієнтські W3 |
| Hard | ok | 2 очікувані помилки (typecheck/fixtures після нового обов'язкового поля) |
| Easy | ok | ітерації без resume; throwaway IT повторив NFR-18 до видалення |
| Duplicated | ok | — |
| Missed | ok | жодних Fail від verifier/reviewers по серверу Phase B |
| Hand-off | ok | «Tests the test-writer should add» — повний список |
| Prompt | ok | 0 resumes |

### 12. implementer — W3-B client
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue | 575k fresh, 17.3 min, 2 resumes (M1, B5) |
| Hard | issue | жодного перегляду в браузері: «I did not check the footer and banner at 1280x720 and 768x600» |
| Easy | ok | 689 тестів зелені |
| Duplicated | ok | — |
| Missed | issue | M1 (діалог 1080 px у вікні 768) знайшов оркестратор вручну; B5 (немає timeout/Retry у модалці) — bug-reviewer і verifier |
| Hand-off | ok | 8 deviations чесно описані |
| Prompt | issue | не вказано «модалки: перевірити ширину ≤ viewport−56», хоча INSIGHTS Phase A уже містили це спостереження про вигляд |

### 13. test-writer — W4-B
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 492k fresh, 14.6k output — єдиний агент, що пише багато; 16 нових файлів |
| Hard | ok | 0 помилок; жодного baг-знаходження в source — це підтверджує якість реалізації |
| Easy | ok | усі 12 клієнтських файлів зелені двічі поспіль, зокрема fake-timers тести |
| Duplicated | issue | перечитав 16 файлів з W2-B/W3-B (topology merge-кандидат, 70% overlap) — це неминуче для автора тестів |
| Missed | ok | NFR-17 «без повного скану» та NFR-10 contrast лишилися без тесту (чесно відзначено) |
| Hand-off | ok | список ID без автотесту |
| Prompt | ok | включив A19–A20 бек-філ — один агент закрив обидві фази |

### 14. plan-verifier — Verify #1 Phase B
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 207k fresh, 57 calls, ad hoc замір таймінгу NFR-13 (2.6–6.1 ms) |
| Hard | ok | не мав Write: «I could not save `verify-3.md`. I have no Write/Edit tool» |
| Easy | ok | таблиця класифікації кожного `t.evalRuns` читача |
| Duplicated | ok | — |
| Missed | issue | знову без браузера — B20 «Pass on your word» |
| Hand-off | issue | оркестратор мусив сам зберегти файл матриці |
| Prompt | ok | — |

### 15. architecture-reviewer — Phase B
| Lens | Verdict | Evidence |
|---|---|---|
| Fit / Hard / Easy / Duplicated / Missed / Hand-off / Prompt | ok | 44k fresh, 1.2 min, 0 findings; відповів на питання про `use-case-run.ts` і `modal-width.ts` з посиланнями на правила |

### 16. general-purpose — Bug review Phase B
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 372k fresh |
| Hard | ok | — |
| Easy | ok | 1 WARNING (B5, conf 0.65), решта «traced held up» |
| Duplicated | ok | — |
| Missed | ok | — |
| Hand-off | ok | — |
| Prompt | ok | 1 resume для підтвердження |

### 17. security-reviewer — Phase B
| Lens | Verdict | Evidence |
|---|---|---|
| Fit / Hard / Easy / Duplicated / Missed / Hand-off / Prompt | ok | 73k fresh, 0 findings; конкретні перевірки tenancy/409/SQL/XSS з `file:line` |

### 18. plan-verifier — Verify #2 Phase B
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 40k fresh, дельта-матриця з загальним verdict на Phase A+B |
| Hard | ok | — |
| Easy | ok | 0 Fail; чесно «Pass on the orchestrator's browser evidence» |
| Duplicated | issue | свіжий запуск замість resume #14 (67% спільного набору) |
| Missed | ok | NFR-10 і відсутність unit-тесту `modal-width` позначено |
| Hand-off | ok | рекомендація залишити `Status: draft` з причинами |
| Prompt | ok | — |

### Orchestrator
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 371,889 fresh = 6.6% від run; усе на Sonnet |
| Hard | issue | 4 помилки інструментів (`browser_find` без параметра, клік по disabled-кнопці, `docker exec` з неправильним quoting, ще одна) — усі дрібні |
| Easy | ok | 4 паралельні запуски рев'юерів+re-verify одним повідомленням (09:44, 10:52) |
| Duplicated | issue | `plan.md` прочитано 5 разів, `client/INSIGHTS.md` 4 (`rereads`) |
| Missed | issue | Phase A пройшла без test-writer, бо `--tests` не було; питання «чи запускати W4» поставлено лише на 10:16, після Phase A |
| Hand-off | ok | стислі таблиці для користувача (триаж WARNING, міграція, режими) |
| Order | issue | 10:32 test-writer чекав на W3-B, хоча серверна половина (NFR-18 IT) залежала лише від W2-B, готового ~10:27 |
| Relays | ok | W-промпти містили діапазон кроків, файли власності та уроки Phase A (type=button, portal) |
| Own work | ok (+) | оркестратор сам виконав A22/B20 у браузері (≈16 `evaluate`, 12 скріншотів) і знайшов 2 дефекти, які ніхто не міг знайти: opacity модалки в muted-картці та ширина 1080 px у вікні 768 |
| User time | ok | питання лише там, де потрібне рішення (Status draft, міграція, режим тестів, триаж WARNING) |

## Duplication
- `.claude/sdd/SPEC-10/plan.md` — 10 акторів, оркестратор ×5.
- `client/src/vendor/ui/kit/Modal.tsx` — оркестратор + 6 агентів (кожен рев'ювер/implementer читає один і той самий файл).
- `scripts/check.sh` — W3-A ×3, W3-B ×1, оркестратор ×1.
- `.claude/skills/run-plan/reference/findings.md` — оркестратор ×2 + рев'юери.
- Той самий факт «Modal не обмежує ширину / дає translucent у картці» знайшли дві різні сутності незалежно (оркестратор у браузері; verifier зафіксував лише «Unverified») — у звітах агентів його не було.

## Topology
| Candidate | Verdict | Reason |
|---|---|---|
| merge test-writer:aa71d08 into implementer:aca0450 (one agent, both briefs) — 16 files read by both | reject | автор коду і автор тестів мусять лишатися незалежними: test-writer не правив source і не знайшов жодного baг — це тестова незалежність, яка тут працює |
| resume implementer:a851211 instead of launching implementer:aca0450 — 71% shared | reject | різні фази й різні рішення (Phase A vs Phase B); контекст A розмивав би B-розв'язки; обидва fresh-запуски були дешевими (246k) |
| merge test-writer:aa71d08 into implementer:a851211 — 11 files | reject | те саме, що перший |
| resume plan-verifier:a859630 instead of launching plan-verifier:a51f61d — 67% | **accept** | pass 2 тієї ж фази має резюмувати pass 1: `run-plan` Phase 5 і так просить delta від `verify-1`; −40k fresh і без повторного читання `plan.md`/spec |
| resume plan-verifier:acac762 instead of launching plan-verifier:ad4e6cc — 60% | **accept** | re-verify AC-25 — це перевірка рядка, який той самий агент знайшов Fail; resume дешевше за свіжий запуск (−35k) |
| resume plan-verifier:acac762 instead of launching plan-verifier:a4b1be8 — 50% | **accept** (як pass 2 тієї ж фази) | ті ж причини; −52k fresh |
| resume plan-verifier:a4b1be8 instead of launching plan-verifier:a859630 — 50% | reject | міжфазний resume (A → B) тягнув би застарілий контекст Phase A; різні diff-бази |
| split implementer:ac03aca — a fresh agent per phase/layer, resume only for fixes (4 resumes, 30% of fresh tokens) | **accept** | 1.72M fresh / 112 calls / span 57.6 min — критичний шлях Phase A; розділити W3-A на W3a (хуки+editor) і W3b (таби+картка+видалення), запускати паралельно |
| try implementer:ac03aca on Opus — 4 resumes and 4 failed gates on a cheaper model | reject | «failed gates» — це findings рев'ю (B1/B3/B4/S1), а не слабкість моделі; їх мав би спіймати браузер/ліміт на форму, не Opus; Opus коштував би ×кілька на 1.7M токенів |
| (manual) test-writer після W2-B ∥ W3-B | **accept** | серверні тести (NFR-18) залежать лише від W2-B, який був готовий ~10:27; запуск test-writer 10:32 чекав W3-B → до ~10 хв зекономлено |
| (manual) оркестратор виконує манual browser check — але жоден агент не має браузера | **accept** | план A22 доручає перевірку «verifier», який не має Playwright (tools: Read, Grep, Glob, Bash); потрібен явний власник |

## Proposals
| # | Action | File | Change | Evidence | Expected effect |
|---|---|---|---|---|---|
| 1 | Edit | `.claude/skills/run-plan/SKILL.md` | Phase 0: поставити одне питання «запускати W4 test-writer? (рекомендовано, якщо план має W4)» замість мовчазного `--tests` off; у Phase 1: запускати серверний test-writer одразу після W2, паралельно з W3 | W4-A пропущено → 8 Unverified у `verify-1.md`; користувач відповів «Так, повний W4-B»; test-writer 10:32 чекав W3-B замість W2-B (~10:27) | −5…10 хв wall на фазу; −8 Unverified рядків у Phase A; бек-філ A19–A20 не потрібен |
| 2 | Edit | `.claude/skills/run-plan/SKILL.md` | Phase 2/5: «pass 2 і re-verify резюмують попереднього plan-verifier (SendMessage), а не запускають нового»; Phase 2 дописати «оркестратор зберігає відповідь у `verify-N.md`, бо verifier не має Write» | topology merge ×3 (a51f61d, ad4e6cc, a4b1be8): 40,381 + 34,969 + 51,714 fresh; звіт `a859630`: «I could not save verify-3.md. I have no Write/Edit tool» | −127,064 fresh tokens за 3 запуски; без ручного збереження матриці |
| 3 | Edit | `.claude/agents/implementer.md` | заборонити `git stash`/`checkout`/`reset` у спільному дереві під час multi-agent run (лише `git diff`/read-only для порівняння бази) | W3-A: «I ran `git stash` and `git stash pop` in the shared tree … if W2-A saw a transient file revert, that was me» | усуває ризик втрати правок паралельного воркера |
| 4 | Edit | `.claude/skills/run-plan/SKILL.md` (Phase 3) і `.claude/agents/implementation-planner.md` | шаги «manual browser check» мають явного власника — оркестратор (є Playwright) — і для кожного UI-кроку implementer мусить повернути готові URL/кроки; не доручати їх `plan-verifier` | plan A22: «the verifier must use data…» vs `plan-verifier` tools `Read, Grep, Glob, Bash`; звіти verifier-ів: «Unverified»/«Pass on your word»; оркестратор знайшов 2 дефекти (opacity, width) через ~16 `evaluate` | дефекти шукає той, хто може; −1 раунд виправлення M1 і portal у Phase B при ранній перевірці |
| 5 | Split | `.claude/agents/implementer.md` (+ планувальник) | W3 (client) ділити на 2 воркери за зонами (editor vs tabs/card), якщо в ньому > 6 кроків або > 4 нових під-компонентів | W3-A: 1,716,864 fresh (30% run), 112 calls, span 57.6; W2-A закінчився ~09:18 — W3-A тримав критичний шлях ~18 хв | −10…15 хв wall на Phase A; менше resume на тому самому контексті |
| 6 | Edit | `.claude/agents/implementer.md` | клієнтська чек-лист-вимога: «Button у `<form>` → `type="button"`; модалка поза карткою/overflow-контейнером → portal; число-ширина → `useFittedModalWidth`» (посилання на INSIGHTS 2026-10-12) | B1 CRITICAL (кнопка skeleton сабмітить форму), portal-дефект, M1 | закриває клас дефектів до рев'ю; −1 CRITICAL і −1 M1-цикл |
| 7 | Edit | `.claude/agents/plan-verifier.md` | дозволити Write лише у `.claude/sdd/**` АБО явно сказати «повертай матрицю у відповіді; оркестратор її збереже» (узгодити з пропозицією 2) | verify-1.md збережено агентом, verify-3.md — ні («no Write/Edit tool»); `quality.sdd` прочитав 0 рядків для ручного файлу | `quality.sdd` стає повним; нема ручного кроку |

## For engineering-insights (not recorded here)
Записано в сесії: модалка в muted-картці (portal), ширина kit `Modal`, `Button` без `type` у формі, `eval_runs.scope`-дисципліна. Не записано: нічого ще.
