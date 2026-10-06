# Workflow retro — SPEC-05 Onboarding Tour (2026-09-30)

Session `7d88bec8-0195-49e4-baff-00819c86541a` · span 162.7 min · active 65.8 min (orchestrator) · 18 agents · max parallel 4
Числа включають перший виклик цього retro (collect).

## Numbers
| Actor | Model | Active min | Fresh tokens | Output | Cache read | Tools | Errors | Resumes |
|---|---|---|---|---|---|---|---|---|
| orchestrator | opus-5-5 (126 calls), sonnet-5-5 (2) | 65.8 | 422 294 | 96 082 | 26 182 374 | 105 | 1 | — |
| 1. spec-creator — Spec intake | opus-5-5 | 6.5 | 278 358 | 21 710 | 2 065 274 | 59 | 0 | 1 |
| 2. researcher — R1 git history | sonnet-5-5 | 0.4 | 16 809 | 87 | 34 214 | 4 | 0 | 0 |
| 3. researcher — R2 indexing | sonnet-5-5 | 0.6 | 26 946 | 101 | 72 124 | 6 | 0 | 0 |
| 4. researcher — R3 host URL | sonnet-5-5 | 0.5 | 16 649 | 105 | 48 584 | 6 | 0 | 0 |
| 5. researcher — R4 aria-current | sonnet-5-5 | 0.9 | 18 556 | 63 | 35 855 | 8 | 0 | 0 |
| 6. implementation-planner | sonnet-5-5 | 2.4 | 56 173 | 295 | 472 760 | 16 | 2 | 2 |
| 7. implementer — S1 contracts + port | sonnet-5-5 | 3.2 | 119 111 | 864 | 1 116 790 | 26 | 2 | 1 |
| 8. implementer — S2 server (+S3, S4, fixes) | sonnet-5-5 | 17.1 | 913 761 | 1 033 | 7 070 055 | 68 | 5 | 7 |
| 9. implementer — S2 client (+S3, S4, fixes) | sonnet-5-5 | 12.4 | 490 887 | 692 | 3 919 168 | 49 | 3 | 6 |
| 10. implementer — S2 e2e | sonnet-5-5 | 1.4 | 55 296 | 111 | 208 773 | 10 | 0 | 1 |
| 11. plan-verifier — Verify #1 | sonnet-5-5 | 2.6 | 88 417 | 587 | 632 068 | 21 | 0 | 0 |
| 12. plan-verifier — Re-verify | sonnet-5-5 | 2.4 | 19 453 | 99 | 71 291 | 6 | 0 | 0 |
| 13. architecture-reviewer | sonnet-5-5 | 0.8 | 29 193 | 116 | 139 620 | 9 | 1 | 0 |
| 14. general-purpose — Bug review | sonnet-5-5 | 1.2 | 93 692 | 69 | 512 839 | 11 | 0 | 0 |
| 15. security-reviewer | sonnet-5-5 | 1.0 | 60 857 | 138 | 419 907 | 13 | 0 | 0 |
| 16. architecture-reviewer — Re-review A1 | sonnet-5-5 | 0.2 | 15 110 | 20 | 9 516 | 2 | 0 | 0 |
| 17. general-purpose — Re-review B1 | sonnet-5-5 | 0.5 | 55 806 | 131 | 354 696 | 8 | 0 | 0 |
| 18. plan-verifier — Verify #2 | sonnet-5-5 | 1.6 | 39 515 | 367 | 290 968 | 12 | 0 | 0 |
| **Total** | | | **2 816 883** | **122 670** | 43 656 876 | | 14 | 18 |

Orchestrator share of fresh tokens: 0.15. Cache read (43.7 M) показано окремо — у «витрачені токени» не додано.

## Outcome
| Gate | Runs | Fails | First try | Final |
|---|---|---|---|---|
| lint-spec.mjs | 3 | 0 | ✓ | ✓ |
| scripts/check.sh | 19 | 3 | ✗ | ✓ |
| vitest | 3 | 0 | ✓ | ✓ |
| scripts/e2e.sh | 2 | 1 | ✗ | ✓ |
| npm run typecheck | 1 | 1 | ✗ | ✗ (евристика: e2e typecheck пізніше проходив у складі інших команд) |
| pnpm test | 3 | 2 | ✗ | ✓ |
| pnpm arch | 2 | 0 | ✓ | ✓ |
| pr-self-review collect / hard-rules / build-report / pr-body | 2 / 1 / 1 / 1 | 1 / 1 / 1 / 1 | — | ✗ (вердикт `block`, закрито `# psr-skip`) |

`/implement`: verify rounds — n/a у лічильниках (`verify-1.md`/`verify-2.md` записані оркестратором як стислий підсумок, не як матриця, тому парсер бачить 0/0/0/0). За звітами: verify #1 — 5 Fail (AC-8, AC-10, AC-26, NFR-6, NFR-12) → round 2 всі Pass; verify #2 — 0 Fail, 7 Pass на непрямих доказах. Review round 1: 2 WARNING + 2 SUGGESTION; round 2: 0.
Resumes: 18 · errors: exit 11, other 2, denied 1.

## Trend
No comparable run: попередній retro (`2026-09-29-spec-04-project-context`) мав лише spec-creator + 2 researcher; цей — повний `/implement`.

## Order
1. 08:12 spec-creator (intake) → 08:16–08:17 R1–R4 паралельно (4 в одному повідомленні).
2. 08:17–08:48 очікування користувача (Q2/Q3, hotness-перемикач) → 08:49 resume spec-creator (phase 2).
3. 09:00 implementation-planner → 09:05, 09:06 два resume (відповіді; approved).
4. 09:13 S1 (послідовно, контракти) → 09:16 S2 server ∥ client ∥ e2e (3 паралельно).
5. 09:23–09:58 S3 і S4 — resume тих самих двох implementer-ів; два AskUserQuestion (09:32, 09:44) на поля контракту.
6. 10:00 verify #1 → 10:03 фікси ∥ → 10:05 re-verify.
7. 10:08 architecture ∥ bug ∥ security → 10:09–10:26 очікування триажу → 10:26 fix → 10:28 два re-review ∥ → 10:28 verify #2.

## Per agent

### 1. spec-creator — Spec intake
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok (flag відхилено) | flag «top-tier, 95% read-only»: читання — підготовка до судження; результат — 26 знахідок з доказами, 4 research requests, spec lint `ok` з першого разу (`lint-spec.mjs` firstTryPass). Sonnet ризикує пропустити F1/F2/F3 (staged pieces без caller). Але це вже другий run поспіль із тим самим flag — варто один раз порівняти на Sonnet. |
| Hard | ok | 0 errors. |
| Easy | ok | Intake-звіт переданий користувачу майже без змін. |
| Duplicated | ok | `rank.ts` прочитав і оркестратор (1×) — пізніше, для пояснення Q2. |
| Missed | issue | Спека не зафіксувала повний набір полів, які рендерить UI: `complexity` (AC-9), час збою (EC-3), hotness для reading path (AC-27) — усі три виявились у реалізації. Частково це зона планувальника (див. 6). |
| Hand-off | ok | Звіт 29 243 символи, але зі структурою (Findings/Approaches/Questions), яку легко стиснути. |
| Prompt | ok | Промпт 5 922 символи передав мокап + вимоги; resume з відповідями та R1–R4 — одним повідомленням. |

### 2–5. researcher — R1–R4
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Sonnet, 0.4–0.9 active min, 16–27 k fresh кожен. |
| Hard | ok | 0 errors. R4 перечитав `uswds.js` 4× (rereads) — дрібно. |
| Easy | ok | Усі 4 звіти використано без додаткових запитів. |
| Duplicated | ok | Питання не перетинались. |
| Missed | ok | R3 підказав прив'язати «Open» до SHA — прийнято в спеку. |
| Hand-off | ok | 4.6–7.8 k символів, із «Could not find». |
| Prompt | ok | Питання, scope і де шукати — з intake-звіту. |

### 6. implementation-planner
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Sonnet, 56 k fresh. |
| Hard | issue (дрібне) | 2 errors: zsh `no matches found: --include=*.ts` (незаквотований glob); diff двох `adapters.ts` вийшов з кодом 1 (очікувано). |
| Easy | ok | 12 питань із дефолтами, користувач відповів одним рядком («решта як запропоновано»). |
| Duplicated | issue | rereads: `server/INSIGHTS.md` 3×, `client/INSIGHTS.md` 3×, CLAUDE.md-файли 2× кожен. |
| Missed | issue | Крок 1 плану описав контракт узагальнено («per-kind items, meta block»), без таблиці «AC → поле контракту». Через це три поля (`complexity`, `last_error_at`, `TourReadingStep.hotness`) знайшлися лише в S2–S4: 3 додаткові resume + 2 AskUserQuestion + ~25 хв (09:23, 09:29–09:39, 09:44–09:56). |
| Hand-off | ok | План збережено дослівно в `specs/05-onboarding-tour.plan.md`; друге повідомлення (approved) дало точний патч. |
| Prompt | ok | Промпт передав уже ухвалені рішення — жодного переоткриття. |

### 7. implementer — S1 contracts + port
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Sonnet. |
| Hard | issue | 2 errors: zsh glob; виклик неіснуючого інструмента `bash` (lowercase). `scripts/check.sh` перечитано 5×. |
| Easy | ok | Gates з першого прогону після фіксу старого fixture. |
| Duplicated | ok | — |
| Missed | issue | Slice-1 gates не мали `server lint` (так у плані) → lint-помилка `preserve-caught-error` у `historyCounts` всплила лише на resume (AC-9). Контракт без `complexity` (AC-9) — див. 6. |
| Hand-off | ok | Чесно назвав: «`historyCounts` was not exercised against a real git repo». |
| Prompt | ok | — |

### 8. implementer — S2 server (далі S3, S4, verify- і review-фікси)
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue (flag підтверджено частково) | flag «7 resumes», freshShare 0.32 (913 761 fresh, cache_write 912 584): один агент вів 3 шари + 3 раунди фіксів, і кожен resume перезаписував у кеш дедалі більший контекст. Модель правильна; форма — ні. |
| Hard | issue | flag «permission denial» (09:30): Edit обох `knowledge.ts` заблоковано; агент зупинився і повідомив, а не обходив — правильно. Також `./scripts/check.sh` not found (cwd), TS2552. |
| Easy | ok | IT-тести з Docker, реальний git-тест для `historyCounts` — додав сам на прохання. |
| Duplicated | ok | — |
| Missed | issue | Verify #1: AC-8 (ліміт 8 замість 5), AC-10/AC-26 (percentile замість rank), NFR-6, NFR-12 — усе поза «inner loop self-check». Архітектура: пряме читання `file_rank` (A1), яке сам назвав «established escape hatch». |
| Hand-off | ok | Кожен звіт мав «API shapes for the client» — це зняло кілька циклів синхронізації з клієнтом. |
| Prompt | ok | — |

### 9. implementer — S2 client (далі S3, S4, фікси)
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue | «6 resumes», 490 887 fresh — та сама причина, що й 8. |
| Hard | issue | zsh glob; `bash` lowercase; тест EC-5 упав з першого разу. Один раз записав файли в корінь репо через невдалий `cd` (сам виправив). |
| Easy | ok | Відповів на всі 6 вимог e2e одразу. |
| Duplicated | ok | — |
| Missed | issue | Помітив прогалини контракту (AC-9, AC-27, час EC-3) і правильно зупинився замість правки контракту — але це три окремі цикли (див. 6). |
| Hand-off | ok | Виносив припущення про рядки сервера окремим блоком — завдяки цьому знайдено розбіжність «Model not configured». |
| Prompt | ok | — |

### 10. implementer — S2 e2e
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 55 k fresh. |
| Hard | ok | 0 errors. |
| Easy | ok | Перелік потрібних текстів/селекторів у звіті — готовий до пересилання клієнту. |
| Duplicated | ok | — |
| Missed | issue | `wait --text "On this page"` упав на CSS-uppercase (перший `e2e.sh` — fail) — хоча `e2e/INSIGHTS.md` 2026-09-24 уже описував саме цю пастку. Промпт казав читати `e2e/CLAUDE.md`, а не `INSIGHTS.md` — частково вина оркестратора. |
| Hand-off | ok | — |
| Prompt | issue | Не вимагав прочитати `e2e/INSIGHTS.md`. |

### 11–12, 18. plan-verifier (verify #1, re-verify, verify #2)
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Sonnet, 19–88 k fresh. Verify #1 знайшов 5 реальних Fail, які пройшли всі gates. |
| Hard | issue (дрібне) | Re-verify: «`check.sh` needs a `[files]` argument» — хибний висновок; запустив package-скрипти напряму. |
| Easy | ok | Матриці з file:line; approved-відхилення не відмічались як Fail. |
| Duplicated | ok | Спеку читали 3 verifier-и — очікувано (кожен свіжий). |
| Missed | ok | Сам позначив UI-8/9/10 як непрямі докази. |
| Hand-off | ok | Fail-рядки переслані implementer-ам без перепису. |
| Prompt | ok | Список approved-відхилень у промпті запобіг хибним Fail. |

### 13–17. reviewers (architecture, bug, security; re-reviews)
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Усі Sonnet, 15–94 k fresh, ≤ 1.2 active min. |
| Hard | ok | 1 exit (grep з кодом 1) у architecture. |
| Easy | ok | JSON-блоки злилися в `review-round-1.json` без правок; re-review дотримались «лише змінені рядки». |
| Duplicated | ok | `findings.md` прочитали всі 4 — очікувано, це їхня схема. |
| Missed | ok | B1 (перезапис LLM-туру) — справжній дефект, пропущений verifier-ом. |
| Hand-off | ok | Bug-reviewer також пояснив флейк IT-тесту (2.5 с poll budget). |
| Prompt | ok | «Points worth a specific look» у промпті архітектора → A1. |

### Orchestrator
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue | 126 з 128 викликів на Opus (422 k fresh, 15%); `/implement` радить Sonnet для оркестратора — запропоновано один раз, користувач не переключив. |
| Order | ok | maxParallel 4; R1–R4, S2×3, reviewers×3, re-reviews×2 — кожні в одному повідомленні. |
| Relays | ok / issue | Добре: e2e-вимоги → клієнту до завершення; «Model not configured» → серверу. Погано: 09:29 переслав implementer-у «you are authorised» для vendor-правки — це не авторизація, отримав denial; правильний порядок (AskUserQuestion → resume) застосовано лише після. |
| Own work | issue | rereads: `scripts/check.sh` 5× (zsh `for g in "server typecheck"` не розщеплює слова → usage 5 разів), `pr-self-review/SKILL.md` 3×, `specs/05-onboarding-tour.md` 3×. `verify-*.md` записано як стислий підсумок → парсер `sdd` бачить 0/0/0/0. |
| Missed | issue | Правка `e2e/INSIGHTS.md` змінила рядок наявного запису → CRITICAL `insights-section-drift` у `/pr-self-review` (файл append-only; скіл каже «sharpen the existing entry»). |
| User time | ok | Очікування: 08:17–08:48 (питання без безпечного дефолту — Q2 змінив обсяг фічі), 10:09–10:26 триаж (обов'язковий за `/implement`). |

## Duplication
- `scripts/check.sh` — orchestrator 5×, implementer S1 5× (usage-текст замість прогону).
- `specs/05-onboarding-tour.md` — orchestrator 3×, planner, verifier ×2 (очікувано).
- `server/INSIGHTS.md`, `client/INSIGHTS.md` — planner 3× кожен; `INSIGHTS.md` — spec-creator, planner 2×, orchestrator.
- `.claude/skills/implement/reference/findings.md` — 4 reviewers + orchestrator (очікувано).
- Той самий факт двічі: «hotness = 0, shallow clone» — spec-creator (F1) і orchestrator (перечитав `rank.ts` для Q2).

## Proposals
| # | File | Change | Evidence | Expected effect |
|---|---|---|---|---|
| 1 | `.claude/agents/implementation-planner.md` | Для кроку «контракт» вимагати таблицю **AC/EC → поле контракту → тип** для кожного значення, яке UI показує або сервер пише в meta; порожній рядок = питання до користувача у Phase 1. | 3 поля знайдено в реалізації: resumes 09:23, 09:29, 09:39, 09:44, 09:56; 2 AskUserQuestion. | −3 resume, −2 зупинки на користувача, ~25 хв. |
| 2 | `.claude/skills/implement/SKILL.md` | Правило: зміна `*/src/vendor/**`, якої немає в плані, → спершу `AskUserQuestion` в основній сесії, потім resume з цитатою відповіді; ніколи не пересилати «you are authorised». | denial 09:30 (`[Modify Shared Resources]`) після relay 09:29. | 0 permission denials, −1 resume. |
| 3 | `.claude/skills/implement/SKILL.md` | Багатошаровий план: **новий** implementer на кожен шар (з планом і попереднім звітом як шляхами), resume — лише для Fix mode того самого шару. | S2 server: 7 resumes, 913 761 fresh (32%); client: 6 resumes, 490 887 (17%). | Менший контекст на шар; оцінка — суттєво менше cache_write, без втрати якості (звіти вже мають «API shapes»). |
| 4 | `.claude/agents/implementer.md` | Перед роботою читати `INSIGHTS.md` модуля (як вимагає root CLAUDE.md) і назвати його в звіті; Shell: завжди брати glob у лапки (`--include='*.ts'`) або використовувати Grep; інструмент — `Bash`, не `bash`. | e2e fail на uppercase, хоча `e2e/INSIGHTS.md` 2026-09-24 описував його; 3 агенти × zsh `no matches found`; 2 × `No such tool available: bash`. | −1 e2e-цикл, −5 помилок інструментів. |
| 5 | `.claude/skills/engineering-insights/SKILL.md` | «Sharpen the existing entry» → «додай датовану примітку під записом; не змінюй і не видаляй наявні рядки» — узгодити з `hard-rules.sh insights-section-drift`. | CRITICAL у `/pr-self-review` після правки оркестратора; довелося окремий коміт `3f91ac2`. | 0 хибних CRITICAL на INSIGHTS. |
| 6 | `.claude/skills/implement/SKILL.md` | Зберігати `verify-N.md` дослівно (матрицю verifier-а), не підсумок; дати точну форму виклику gates: `./scripts/check.sh server test` (без циклу по рядках у zsh). | `quality.sdd.verify` = 0/0/0/0 для обох раундів; check.sh usage 5× в оркестраторі; verifier вирішив, що check.sh «needs [files]». | Метрики retro для verify; −5 марних викликів. |
| 7 | `.claude/agents/spec-creator.md` (експеримент) | Один наступний run intake на Sonnet (`model: sonnet` у виклику) і порівняти кількість/якість Findings. | flag «top-tier, 95% read-only» — другий run поспіль; 278 358 fresh на Opus. | Якщо якість тримається — ~−200 k fresh за run на найдорожчій моделі. |

## For engineering-insights (not recorded here)
- Уже записано цієї сесії: відмова vendor-правки при пересланій авторизації (root), флейк `onboarding-tour.it` під паралельним навантаженням (server), `wait --text` vs CSS uppercase (e2e).
- Не записано: zsh не розщеплює `$var` у `for` → `./scripts/check.sh $g` друкує usage (root, Tool & Library Notes) — варто додати.
