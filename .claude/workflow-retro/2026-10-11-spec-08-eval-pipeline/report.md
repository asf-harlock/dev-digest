# Workflow retro — SPEC-08 Eval Pipeline (2026-10-11)

Session `7f1befed-b7e5-4a34-b16f-e65abafa5e4b` · span 117.3 min · active 28.0 min · 19 agents · max parallel 4
Numbers include this retro's first call. Повний ланцюжок: spec-creator → 4× researcher → implementation-planner → `/run-plan SPEC-08 --tests` (implementers, test-writers, verify #1, 3 reviewers, fix loop, verify #2). Вікно не задавалось: уся сесія — це один workflow.

## Numbers
| Actor | Model | Active min | Fresh tokens | Output | Cache read | Tools | Errors | Resumes |
|---|---|---|---|---|---|---|---|---|
| orchestrator | opus-5-5 (33 calls) → sonnet-5-5 (40 calls) | 28.0 | 595,377 | 86,026 | 16,483,076 | 66 | 3 | — |
| 1. spec-creator — Eval Pipeline spec intake | opus-5-5 | 10.4 | 649,068 | 43,581 | 4,940,891 | 96 | 2 | 2 |
| 2. researcher — R1: locate verify:l06 | sonnet-5-5 | 1.0 | 47,505 | 120 | 322,729 | 21 | 5 | 0 |
| 3. researcher — R2: prior eval implementation in git | sonnet-5-5 | 1.6 | 86,845 | 154 | 787,743 | 41 | 7 | 0 |
| 4. researcher — R3: LLM determinism settings | sonnet-5-5 | 1.5 | 65,495 | 578 | 643,117 | 25 | 4 | 0 |
| 5. researcher — R4: precision methods (web) | sonnet-5-5 | 2.1 | 39,918 | 116 | 229,027 | 26 | 1 | 0 |
| 6. implementation-planner — Plan SPEC-08 | sonnet-5-5 | 7.7 | 274,107 | 711 | 2,383,159 | 39 | 0 | 1 |
| 7. implementer — W1 contracts + db schema | sonnet-5-5 | 2.2 | 82,530 | 501 | 1,152,134 | 20 | 1 | 0 |
| 8. implementer — W2 server eval module | sonnet-5-5 | 7.3 | 227,902 | 633 | 4,767,276 | 43 | 0 | 1 |
| 9. implementer — W1b client scaffold | sonnet-5-5 | 3.8 | 113,495 | 9,468 | 1,405,961 | 23 | 0 | 0 |
| 10. implementer — W3 PR page + Evals tab | sonnet-5-5 | 6.4 | 477,550 | 512 | 4,688,886 | 55 | 2 | 2 |
| 11. implementer — W4 Dashboard + Compare | sonnet-5-5 | 6.9 | 170,480 | 1,085 | 3,707,367 | 43 | 3 | 0 |
| 12. test-writer — W5 server tests | sonnet-5-5 | 6.1 | 221,263 | 703 | 4,867,850 | 50 | 1 | 0 |
| 13. test-writer — W6 client tests | sonnet-5-5 | 8.2 | 416,109 | 677 | 8,177,198 | 62 | 0 | 1 |
| 14. plan-verifier — Verify #1 | sonnet-5-5 | 6.3 | 209,007 | 341 | 5,130,526 | 46 | 0 | 0 |
| 15. architecture-reviewer | sonnet-5-5 | 1.1 | 63,907 | 415 | 437,177 | 14 | 0 | 0 |
| 16. general-purpose — Bug review | sonnet-5-5 | 2.9 | 182,685 | 263 | 3,780,131 | 31 | 1 | 0 |
| 17. security-reviewer | sonnet-5-5 | 1.1 | 82,951 | 357 | 775,695 | 17 | 0 | 0 |
| 18. general-purpose — Bug re-review round 2 | sonnet-5-5 | 0.3 | 37,272 | 37 | 162,821 | 5 | 0 | 0 |
| 19. plan-verifier — Verify #2 | sonnet-5-5 | 3.2 | 95,524 | 627 | 1,409,848 | 28 | 1 | 0 |
| **Total** | | | **4,138,990** | **146,905** | **66,252,612** | | **31** | **7** |

Orchestrator share of fresh tokens: 0.14. `cache_read` (66.3M) не входить у «fresh» і здебільшого є тим самим контекстом, що перечитується щоразу. Fresh за моделлю: Opus 890,881 (spec-creator 649,068 + оркестратор), Sonnet 3,248,109.

## Outcome
| Gate | Runs | Fails | First try | Final |
|---|---|---|---|---|
| lint-spec.mjs | 3 | 0 | yes | yes |
| pnpm typecheck | 1 | 0 | yes | yes |
| scripts/check.sh | 11 | 1 | yes | yes |
| vitest | 12 | 9 | no | yes |
| eslint | 1 | 0 | yes | yes |
| tsc | 1 | 0 | yes | yes |
| pnpm test | 3 | 3 | no | **no** |
| pnpm arch | 2 | 0 | yes | yes |
| pnpm lint | 2 | 0 | yes | yes |

- `pnpm test` final=no: два запуски від verifier #2 падають на 5 тестах `skills-stats.it.test.ts` / `skills.it.test.ts` (422 через відсутній `days`). Це «до-наявні» за висновком verifier'ів (файли skills у diff не змінені). **Базовий стан на `base_sha` ніхто не прогнав**, тож це висновок, а не вимірювання. Третій запуск — W6 з власною TS-помилкою в тесті, потім виправлена.
- `vitest` 9 fails: 4 — власні перші запуски W5 (`scoring` ×2, `frozen-input` ×1, `executor` ×1, усі виправлені); решта — ті самі 5 skills-тестів у verify #1.
- `/run-plan` стан: verify 2 раунди, review 2 раунди. Знахідки раунду 1: 1 WARNING (B1, виправлена), раунд 2 — 0. Лічильники `quality.sdd.verify` (0/0/0/1 та 0/0/0/0) **не відображають результат**: `verify-1.md` / `verify-2.md` написані оркестратором як стислі підсумки, а не матриці у форматі, який парсить скрипт. n/a.
- Resumes: 7 · errors: exit 13, other 18.

## Trend
Порівнянний прогін за складом агентів: `2026-09-30-spec-05-onboarding-tour` (spec-creator + 4 researcher + planner + implementers + verifiers + reviewers). Обсяг робіт не нормалізований.
- fresh tokens: 2,816,883 → 4,138,990 (+1,322,107)
- active min: 65.8 → 28.0 (−37.8)
- resumes: 18 → 7 (−11)
- errors: 14 → 31 (+17)
- gates first-try pass: 4 з 11 → 7 з 9
- orchestrator share: 0.15 → 0.14
- max parallel: 4 → 4

`2026-10-02-spec-07-pr-context` (без spec-creator/researcher): fresh 1,591,857, active 34.7, resumes 1, gates 3/3 — не порівнянний.

## Order
1. 09:45:14 spec-creator (фаза 1: intake)
2. 09:50:27–09:50:40 researcher R1–R4 — **одним повідомленням, паралельно** (1.0–2.1 хв кожен)
3. 09:53:03 питання користувачу → 09:56:58 resume spec-creator (спека)
4. 10:08:18 implementation-planner (одразу після «передавай спеку» 10:08:03)
5. 10:12:44 питання Q1–Q3 → 10:22:01 resume planner (+ resume spec-creator для оновлення спеки)
6. **10:25 → 10:59 — 34 хв очікування користувача** (план збережено; `/run-plan` запускає користувач)
7. 10:59:51 питання про статус `draft` → `approved`
8. 11:00:56 W1 (один, послідовно — решта залежить від контрактів)
9. 11:03:23 W2 ∥ 11:03:32 W1b
10. 11:07:24 W3 ∥ 11:07:35 W4 (W2 ще працював; 3 паралельні)
11. 11:10:59 W5 (під час W3/W4) → 11:14:37 W6
12. 11:22:14 питання про міграції → застосовано
13. 11:23:09 verify #1
14. 11:29:48–11:30:01 architecture ∥ bug ∥ security **одним повідомленням** + resume W6 (NFR-7)
15. 11:33:37 «fix» → resume W3
16. 11:34:35 bug re-review ∥ 11:34:41 verify #2

## Per agent
### 1. spec-creator — Eval Pipeline spec intake
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue (частково) | Прапор підтверджено числами: Opus, 86% read-only викликів, 649,068 fresh = 73% від Opus-fresh (890,881). Але інтейк містив судження, на які посилалися далі: F1 (`eval_runs` — один рядок на case), F2 (snapshot skills лише id), F4 (діапазон може не перетинати hunk), F5 (знаменник precision). Той самий прапор був у spec-04 і spec-05, ніхто не перевіряв, чи Sonnet впорається |
| Hard | issue (мало) | 2 помилки: ripgrep відхилив look-around патерн, no-op Edit. Bash у нього немає, тож lint запускав оркестратор (3 запуски) |
| Easy | ok | spec пройшов lint з першого разу (`ok`, обидва рази); self-check знайшов і виправив подвійне `(shall)` в EC-1 |
| Duplicated | issue (мало) | `INSIGHTS.md` ×3 файли, `eval.ts`, `eval-ci.ts`, `agents/repository.ts` прочитані ним, а потім ще раз planner'ом (sharedReads) — але з іншою метою |
| Missed | issue | AC-58 («`progress:{done,total}`»), AC-60 («повертає дельти»), AC-61 («map») — буквальне формулювання, яке planner потім змінив на `cases_done/cases_total`, «old/new без дельт», `links[]`. Три рядки verify-1 з відхиленням |
| Hand-off | ok | 29,779 символів за 3 hand-back'и; таблиця F1–F25 + питання з default'ами → я стиснув у 3 блокуючі питання |
| Prompt | ok | 8,616 символів; 2 resumes — це двофазний протокол агента (інтейк → спека → оновлення), не прогалина промпта |

### 2. researcher — R1: locate verify:l06
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Sonnet, 47,505 fresh, 1.0 хв; рішуча знахідка (`verify:l06` лише на `upstream/full-functionality`) |
| Hard | issue | 5 відмов `researcher-guard`: `$(`, змінні `$c`/`$r`, форми `sed` |
| Easy | ok | висновок і «Could not determine» чесні |
| Duplicated | ok | — |
| Missed | ok | — |
| Hand-off | issue (малі) | 9,861 символів; мій перший переказ неправильно приписав upstream «будь-яка знахідка без збігу = шум» — див. Orchestrator |
| Prompt | ok | 1,485 символів |

### 3. researcher — R2: prior eval implementation in git
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 86,845 fresh, 1.6 хв; знайшов Design 1/Design 2 і точне визначення precision у SPEC-12 |
| Hard | issue | 7 помилок: 4 відмови guard (змінні `$s`/`$f`, `sed`), 3 exit-коди (`git log … \| grep`) |
| Easy | ok | вихід з `ref:path` на кожне твердження |
| Duplicated | ok | — |
| Missed | ok | — |
| Hand-off | ok | 14,202 символів, перерахунок «Could not determine» |
| Prompt | ok | 1,331 символів |

### 4. researcher — R3: LLM determinism settings
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 65,495 fresh, 1.5 хв |
| Hard | issue | помилка «Grep is not available in this session»; guard при цьому радить «використовуй Grep tool» замість `grep -r` — суперечність; ще 3 відмови guard |
| Easy | ok | вихідні відповіді на 4 питання |
| Duplicated | ok | `run-executor.ts` перечитаний 5 разів ним самим |
| Missed | issue | негативне твердження «top_p/seed ніде не з'являються» обмежене нерекурсивним grep по вибраних директоріях (його ж «Could not determine») |
| Hand-off | ok | 17,153 символів; відповіді на 4 питання з `file:line` |
| Prompt | ok | 930 символів |

### 5. researcher — R4: code-review eval precision methods
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | веб-дослідження, 39,918 fresh, 2.1 хв |
| Hard | ok | 1 помилка; kluster не завантажився (DNS), Qodo methodology не отримано — задекларовано |
| Easy | ok | чітка таблиця (a)/(b) |
| Duplicated | ok | — |
| Missed | ok | — |
| Hand-off | ok | 10,945 символів; рекомендація збіглася з default'ом spec-creator |
| Prompt | ok | 1,195 символів |

### 6. implementation-planner — Plan SPEC-08
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Sonnet, 274,107 fresh (7%) |
| Hard | ok | 0 помилок |
| Easy | ok | план виконано 5 implementer'ами без жодного контрактного пропуску у W1 крім розміщення `Provider` (TDZ) |
| Duplicated | issue (мало) | rereads: `eval.json` ×3, `INSIGHTS.md` ×2, контракти ×2 |
| Missed | issue | (1) літеральні AC-58/60/61 не позначено `Conflicting`; (2) не назвав ключі `details` для 409 — W1b вгадував три варіанти (`case_id`/`caseId`/`id`), я надсилав W2 окреме повідомлення; (3) форми запусків «у `knowledge.ts`» — W1 переніс у `eval-ci.ts` через TDZ |
| Hand-off | ok | 53,803 символів за 2 hand-back'и; кожне поле контракту перелічене в кроці 1 |
| Prompt | ok | 2,948 символів; 1 resume з відповідями користувача — за протоколом |

### 7. implementer — W1 contracts + db schema
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 82,530 fresh, 2.2 хв |
| Hard | ok | 1 помилка (other); обидві міграції згенеровано без rename-запиту |
| Easy | ok | — |
| Duplicated | ok | `eval-ci.ts` ×2 |
| Missed | ok | відхилення (TDZ) повідомлено, не приховано |
| Hand-off | ok | перелік полів та колонок за фактом |
| Prompt | ok | 1,688 символів |

### 8. implementer — W2 server eval module
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 227,902 fresh, 7.3 хв, 43 викликів |
| Hard | ok | 0 помилок |
| Easy | ok | gates (typecheck/lint/arch/608 тестів) зелені з першого разу |
| Duplicated | ok | — |
| Missed | ok | W5 не знайшов жодного дефекту в його коді |
| Hand-off | ok | список експортів для W5 і непідтверджених без Docker місць |
| Prompt | ok | 2,894 символів; 1 resume — моє повідомлення про ключі `details` |

### 9. implementer — W1b client scaffold
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 113,495 fresh; найбільший output серед implementer'ів (9,468 — JSON i18n) |
| Hard | ok | 0 помилок |
| Easy | ok | — |
| Duplicated | ok | — |
| Missed | issue (мало) | ключі `errors.start*`, `evalsTab.newCase` додані й не використані |
| Hand-off | ok | дерево i18n-ключів і сигнатури hooks |
| Prompt | ok | 3,025 символів |

### 10. implementer — W3 PR page button + Evals tab
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 477,550 fresh (12%), 55 викликів, 47 Bash |
| Hard | issue | `check.sh client related` → FAIL: 7 тестів `FindingsPanel.test.tsx` (`No QueryClient set`); чесно повідомив |
| Easy | ok | — |
| Duplicated | ok | — |
| Missed | **issue** | звіт стверджує «No missing i18n keys; every key I used exists», а `evalsTab.kpi.traces` не існував (є `tracesPassed`) — знайшов W6; `typecheck`/`lint`/`arch` такого не ловлять |
| Hand-off | ok | позначив відхилення: власні файли поза переліком (`page.tsx`, `ReviewRunAccordion.tsx`), `DiffViewer` замість нового компонента, дельта поза `MetricCard` |
| Prompt | ok | 3,341 символів; 2 resumes — мої follow-up'и (i18n-ключ, B1) |

### 11. implementer — W4 Eval Dashboard + Compare pages
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 170,480 fresh, 6.9 хв |
| Hard | issue (мало) | 3 помилки; одна — TS2344 у `.next/types/validator.ts`, бо інший процес перегенерував `.next` під час його typecheck; повтор пройшов |
| Easy | ok | — |
| Duplicated | ok | — |
| Missed | ok | відхилення (власний SVG замість kit `LineChart`, `GapSparkline`) обґрунтовані й підтверджені architecture-рев'ю (`LineChart`: `s.data[i] ?? 0`) |
| Hand-off | ok | 5,164 символів, відхилення пронумеровані |
| Prompt | ok | 3,334 символів, включно зі шляхами до макетів |

### 12. test-writer — W5 server eval tests
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 221,263 fresh, 6.1 хв, 38 інтеграційних + 89 hermetic тестів (84 у `src/modules/eval` + 5 паритет) |
| Hard | issue (мало) | перший vitest: scoring 2 fails, frozen-input 1, executor 1 — власні припущення тестів, виправив |
| Easy | ok | Docker був доступний, `eval.it` пройшов тричі без флейків |
| Duplicated | ok | — |
| Missed | ok | сам знайшов три розбіжності «текст спеки ↔ реалізований контракт» |
| Hand-off | ok | чіткі таблиці по файлах, чесне «NFR-1 перевірено через аналіз імпортів» |
| Prompt | ok | 5,004 символів (найбільший), але з точними іменами експортів — без перечитування джерел |

### 13. test-writer — W6 client eval tests
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 416,109 fresh (10%), 62 виклики, 8.2 хв |
| Hard | ok | 0 помилок |
| Easy | ok | 564 тести пройшли, регресію `FindingsPanel` виправлено |
| Duplicated | ok | — |
| Missed | issue (спричинено оркестратором) | verify #1 S22: тестів на розмір цілей ≥24×24 не було; мій промпт їх не вимагав |
| Hand-off | ok | знайшов реальний баг (`traces` i18n) і не «виправив» його в чужому коді, а поклав `it.fails` |
| Prompt | issue | не містив NFR-7 (розмір цілей) — 1 resume |

### 14. plan-verifier — Verify #1
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 209,007 fresh, 6.3 хв, сам перезапустив гейти |
| Hard | ok | 0 помилок |
| Easy | ok | 143/144 Pass, S22 і NFR-7 — реальні знахідки |
| Duplicated | ok | гейти — за призначенням |
| Missed | ok | — |
| Hand-off | issue | 21,196 символів матриці; оркестратор зберіг лише 1.5k підсумку у `verify-1.md` (відхилення від скіла) |
| Prompt | ok | 1,926 символів |

### 15. architecture-reviewer
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 63,907 fresh, 1.1 хв |
| Hard / Easy | ok | 0 помилок; прив'язано до зеленого `pnpm arch` |
| Duplicated | ok | — |
| Missed | ok | 0 знахідок; bug-рев'ю знайшло 1, але це не архітектурне |
| Hand-off | ok | розділ «Prose only» чесно відділений від машинних гейтів |
| Prompt | ok | 1,348 символів |

### 16. general-purpose — Bug review
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Sonnet, 182,685 fresh — найдорожчий рев'юер, єдиний з реальною знахідкою (B1, confidence 0.8, WARNING) |
| Hard / Easy | ok | 1 помилка exit, 31 виклик |
| Duplicated | ok | — |
| Missed | ok | 2 нижче порога (міграція NOT NULL, подвійний клік у `FindingsPanel`) задекларовані |
| Hand-off | ok | таблиця + findings-json |
| Prompt | ok | 2,703 символів із переліком гарячих місць |

### 17. security-reviewer
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 82,951 fresh, 1.1 хв |
| Hard / Easy | ok | 0 помилок |
| Duplicated | ok | — |
| Missed | ok | 0 знахідок; список «Checked» і «Not checked» (npm audit не запускався) |
| Hand-off | ok | — |
| Prompt | ok | 1,579 символів |

### 18. general-purpose — Bug re-review round 2
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 37,272 fresh, 0.3 хв |
| Hard / Easy | ok | 5 викликів |
| Duplicated | ok | — |
| Missed | ok | fixed + 5 крайніх випадків розібрано |
| Hand-off | ok | 2,074 символів |
| Prompt | issue | довелося вручну пояснити, що виправлення лежить в untracked-файлах і `git diff` його не покаже — механізм скіла цього не покриває (див. пропозицію 2) |

### 19. plan-verifier — Verify #2
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 95,524 fresh, 3.2 хв, гейти перезапущено |
| Hard | ok | 1 помилка exit |
| Easy | ok | S22 і B1 закрито; NFR-7 чесно лишено Unverified |
| Duplicated | issue | власна примітка: «row-level evidence is mostly the named passing tests plus the pass-1 matrix»; повна матриця (15,698 символів) переказує verify #1 |
| Missed | issue | NFR-5 позначено «Unverified (carried from pass 1)», але verify #1 мав NFR-5 = Pass (`saveProgress`/`finalizeRun` лише за `status='running'`). Суперечність між проходами |
| Hand-off | issue | матриця великa; оркестратор зберіг 1.6k підсумку |
| Prompt | ok | 1,831 символів |

### Orchestrator
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Opus 33 викликів (spec/plan-фази), Sonnet 40 (за `/model sonnet` користувача); частка 0.14 |
| Hard | issue | 3 помилки; дві — відомі zsh-пастки з кореневого `CLAUDE.md` («quote globs»): `ls .claude/commands/run-plan*` (no matches found) та `echo ======` (zsh розкрив `=…`); третя — `ls` неіснуючого каталогу, нешкідлива |
| Easy | ok | паралельні запуски без простою; fix-loop мав один раунд |
| Duplicated | issue (мало) | `specs/08` ×3, `INSIGHTS.md` ×3 / server ×2 / client ×2, `findings.md` ×2: частина вимагається скілом (read-before-record, схема findings), але ці файли вже читали spec-creator і planner |
| Missed | **issue** | див. нижче |
| Order | ok | R1–R4 разом; W2∥W1b; W3∥W4 з W5 «зверху»; 3 рев'юери + resume W6 одним повідомленням; bug re-review ∥ verify #2 |
| Relays | ok | R1–R4 передано spec-creator стисло; відповіді користувача — дослівно у resume planner; експорти W2 → промпт W5 |
| User time | issue (за дизайном) | 117.3 − 28.0 = 89.3 хв очікувань; з них 34 хв (10:25→10:59) — крок користувача (`/run-plan`), безпечного default'у немає |
| Prompt | issue | промпт W6 не містив NFR-7 (розмір цілей) → S22 Fail → resume |

**Orchestrator — Missed (докази):**
1. Три розбіжності «текст спеки ↔ контракт» (AC-58, AC-60, AC-61) я помітив після W5, пообіцяв виправити через spec-creator і **не виправив**; спека залишилась `approved` з формулюваннями, які код не виконує буквально. У підсумку прогону цього пункту теж немає.
2. `verify-1.md` / `verify-2.md` — підсумки, а не матриці; `review-round-2.json` не записано (скіл вимагає). Через це `quality.sdd.verify` у метриках порожній.
3. Мій перший переказ R1 приписав upstream «будь-яка знахідка без збігу = шум»; R1 цього не казав (SPEC-12: precision = 1 − FP/total). Помилку виправив після R2 у наступному повідомленні.
4. «NFR-5 Unverified» я передав користувачу як вердикт verifier #2, не помітивши, що verify #1 мав NFR-5 = Pass.
5. Твердження «5 падінь не наші» спирається лише на порожній diff по skills-файлах; baseline на `base_sha` не прогнано.

## Duplication
- `specs/08-eval-pipeline.md`: orchestrator ×3, planner ×1, implementer'и ×6 (W2 ×2, W1b ×2, W3 ×2), test-writer W5 ×7, verifier'и ×3.
- `INSIGHTS.md` (root/server/client): spec-creator ×1, planner ×1–2, orchestrator ×2–3.
- `eval-ci.ts` / `knowledge.ts` / `eval.ts`: читали spec-creator, R2, planner, W1, W2, W5, verifier #1; `client/messages/en/eval.json`: spec-creator, R2, planner ×3, W1b, W3, W4.
- Один і той самий факт у двох звітах: `verify:l06` лише на `upstream/full-functionality` (R1 і R2); precision за SPEC-12 (R2 і spec-creator Phase 2).
- Перечитування самим агентом: R3 `run-executor.ts` ×5; planner `eval.json` ×3.

## Topology
| Candidate | Verdict | Reason |
|---|---|---|
| merge implementer:adcd5b8 into implementation-planner:a05da30 (one agent, both briefs) — 17 files read by both | reject | planner read-only і має передувати implementer'ам; спільні файли — constraints-доки та контракти. Злиття змусило б планувальника писати код |
| resume plan-verifier:a0bced8 instead of launching plan-verifier:af89217 — 83% of the smaller read set shared | reject | другий прохід має перевіряти незалежно (і перезапускати гейти); проблема не в запуску, а в розмірі матриці — див. пропозицію 4 |
| resume implementer:a00a719 instead of launching implementer:a74c833 — 53% shared | reject | W4 ішов паралельно з W3 на непересічних файлах; resume W1b тягнув би його контекст (1.4M cache read); перетин — спільні constraints-доки |
| merge implementation-planner:a05da30 into researcher:ad54bcc — 4 files read by both | reject | різні ролі: R2 — пошук в історії git, planner — план |
| merge implementer:adb78b3 into implementation-planner:a05da30 — 6 files read by both | reject | те саме, що №1 |
| merge researcher:ad54bcc into spec-creator:a5f36a2 — 3 files read by both | reject | чотири researcher'и навмисно паралельні і закінчилися за 1.0–2.1 хв; злиття в spec-creator (10.4 активних хв) серіалізувало б їх |
| merge implementer:adb78b3 into researcher:ad54bcc — 3 files read by both | reject | implementer пише, researcher лише читає |
| merge test-writer:aa15476 into researcher:ad54bcc — 3 files read by both | reject | test-writer пише тести, researcher не має Write/Edit |
| run spec-creator:a5f36a2 on Sonnet for one comparable run — 86% read-only calls | **accept (експеримент)** | 649,068 fresh = 73% від Opus-fresh; той самий прапор у spec-04 (99% read, 71% fresh) і spec-05 (95% read) — ніхто не перевіряв; критерій «краще/гірше» визначено в пропозиції 1 |
| lower concurrency 4 → 3 — 26 failures with ≥ 2 other agents active vs 15 otherwise | reject | відмови — це `researcher-guard` у R1–R3 (запущені разом на старті): `$(`, змінні, `sed`, `grep -r`; жодної гонки за ресурс. Єдина реальна колізія — W4: `.next/types` перегенерував інший процес, повтор пройшов |

## Proposals
| # | Action | File | Change | Evidence | Expected effect |
|---|---|---|---|---|---|
| 1 | Model | `.claude/agents/spec-creator.md` | `model: opus` → `sonnet` для одного порівнянного прогону на спеці схожого розміру; критерій: lint з першого разу + кількість AC, змінених planner'ом у Phase 1, + non-Pass рядки verify, що походять з тексту спеки | 649,068 fresh = 73% від Opus-fresh (890,881); 86% read-only; прапор у 3 прогонах поспіль | до −649,068 Opus-fresh токенів на прогін, якщо якість збережеться; якщо ні — повернути `opus` |
| 2 | Edit | `.claude/skills/run-plan/reference/findings.md` | механізм re-review: замість `git stash create` + список untracked-файлів на початок раунду, зберігати хеші untracked-файлів (`git ls-files -o --exclude-standard` → `shasum`) і порівнювати їх у re-review; або `git add -N` перед виправленням | `git diff <sha> --stat` не показав виправлення B1 (файл untracked і до, і після); довелося вручну пояснювати агенту №18 | re-review змінених рядків стає механічним для кожного прогону нової фічі (нові каталоги завжди untracked) |
| 3 | Edit | `.claude/agents/implementation-planner.md` | Phase 1, Step 3: AC, чиє буквальне формулювання (назва поля, форма відповіді) план змінює, — позначати `Conflicting` і просити оновлення спеки **до** Phase 2; додати ключі `details` помилок до «Contract coverage» | AC-58/60/61 у verify-1/verify-2; W1b вгадував `case_id`/`caseId`/`id`, W2 отримав окреме повідомлення | 3 відхилення verify → 0; одним resume менше (W2) |
| 4 | Edit | `.claude/skills/run-plan/SKILL.md` | Phase 5: verify #2 повертає повну матрицю лише для рядків, що змінилися або не Pass, решту — підрахунком | verify #2: 95,524 fresh, 15,698 символів звіту; сам визнає «row-level evidence is mostly … the pass-1 matrix»; плюс суперечність NFR-5 між проходами | менший звіт (ціль ≤ ⅓ від 21,196 символів verify #1) і менше шансів на суперечливий «carried» |
| 5 | Edit | `~/.claude/agents/researcher.md` | у «Guardrails» додати: `git grep -n <pat> <ref> -- <path>` — дозволений рекурсивний пошук (guard його пускає, `researcher-guard.py:54`), коли Grep-інструмента в сесії немає; не використовувати цикли зі змінними (`for f in …`), `$(`, `sed` крім `N,Mp` | 12 відмов guard у R1–R3 (5 + 4 + 3) з 45 викликів; R3: «Grep is not available in this session» при пораді guard «use the Grep tool» | −12 викликів, скорочення wall-time R1–R3 (1.0–1.6 хв кожен); негативні твердження R3 стають повними |
| 6 | Edit | `.claude/agents/implementer.md` | перед звітом «no missing i18n keys» — перевірити кожен `t("…")` проти `messages/<locale>/*.json` (напр. grep ключа) і вказати команду у звіті | W3: «every key I used exists» ↔ W6: `MISSING_MESSAGE` для `evalsTab.kpi.traces`; виправлення коштувало resume W3 і `it.fails` у тесті | клас помилок, що ловиться лише на етапі тестів, закривається в implementer'і |
| 7 | Edit | `.claude/skills/run-plan/SKILL.md` | Phase 0: записати baseline (`./scripts/check.sh <pkg> test` на чистому дереві) у `state.json`; «до-наявні падіння» = ті, що є в baseline | `pnpm test` final=no (3 запуски); 5 падінь названо до-наявними лише за порожнім diff | твердження «не наші» стає вимірюванням; без нього gate `pnpm test` завжди червоний у метриках |

## For engineering-insights (not recorded here)
Три записи вже зроблено в кінці прогону (client — kit-графіки і null; server — двопрохідний `db:generate`; root — `verify:l06` лише на `upstream/full-functionality`). Нових із цього retro: `researcher-guard` пускає `git grep`, але не `grep -r` і не змінні/`$(`; `git stash create` не бачить зміни в untracked-файлах.
