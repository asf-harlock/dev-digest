# Workflow retro — SPEC-07 PR Context, `/run-plan` (2026-10-02)

Session `0e83e3f6-c109-464e-ac0b-b42970ecdf35` · вікно 14:58:00–18:33:40 UTC (від запуску planner-а до кінця `engineering-insights`; PR-опис після цього не входить) · span 215.3 min · active 34.7 min (orchestrator) · 18 agents · max parallel 3
Retro зібрано з іншої сесії (`--session`), тому його власний перший виклик у числа **не** входить.

## Numbers
| Actor | Model | Active min | Fresh tokens | Output | Cache read | Tools | Errors | Resumes |
|---|---|---|---|---|---|---|---|---|
| orchestrator | opus-5-5 (102 calls) | 34.7 | 369 723 | 60 461 | 16 468 401 | 86 | 0 | — |
| 1. implementation-planner — Plan SPEC-07 | sonnet-5-5 | 3.3 | 57 709 | 210 | 317 784 | 11 | 0 | 1 |
| 2. implementer — W1 contracts | sonnet-5-5 | 1.3 | 50 518 | 263 | 285 299 | 10 | 0 | 0 |
| 3. implementer — W2a server resolver | sonnet-5-5 | 4.3 | 106 403 | 290 | 1 468 997 | 21 | 1 | 0 |
| 4. implementer — W2c reviewer-core | sonnet-5-5 | 0.7 | 33 298 | 106 | 194 579 | 8 | 0 | 0 |
| 5. implementer — W2d client | sonnet-5-5 | 3.3 | 78 616 | 325 | 1 367 101 | 25 | 1 | 0 |
| 6. implementer — W2b server consumers | sonnet-5-5 | 2.5 | 80 079 | 249 | 1 069 466 | 20 | 0 | 0 |
| 7. implementer — contract gap fixes | sonnet-5-5 | 2.5 | 65 684 | 366 | 1 176 670 | 25 | 1 | 0 |
| 8. implementer — AC-2 origin badge | sonnet-5-5 | 1.9 | 52 164 | 226 | 600 420 | 17 | 1 | 0 |
| 9. test-writer — SPEC-07 tests | sonnet-5-5 | 11.9 | 259 057 | 1 121 | 12 277 531 | 88 | 2 | 0 |
| 10. plan-verifier — verify pass 1 | sonnet-5-5 | 1.9 | 63 328 | 187 | 758 441 | 23 | 0 | 0 |
| 11. implementer — verify-1 fails | sonnet-5-5 | 3.4 | 81 147 | 354 | 1 481 648 | 29 | 0 | 0 |
| 12. plan-verifier — verify-1 recheck | sonnet-5-5 | 1.0 | 21 382 | 98 | 108 957 | 8 | 0 | 0 |
| 13. architecture-reviewer — review | sonnet-5-5 | 0.5 | 19 193 | 94 | 66 050 | 5 | 0 | 0 |
| 14. general-purpose — bug review | sonnet-5-5 | 1.5 | 105 797 | 135 | 1 043 946 | 16 | 0 | 0 |
| 15. security-reviewer — review | sonnet-5-5 | 0.6 | 65 366 | 56 | 219 888 | 9 | 0 | 0 |
| 16. implementer — fix A1 | sonnet-5-5 | 0.4 | 28 822 | 43 | 49 702 | 3 | 0 | 0 |
| 17. architecture-reviewer — A1 re-review | sonnet-5-5 | 0.2 | 13 024 | 19 | 10 598 | 2 | 0 | 0 |
| 18. plan-verifier — verify pass 2 | sonnet-5-5 | 1.3 | 40 547 | 73 | 141 965 | 9 | 0 | 0 |
| **Total** | | | **1 591 857** | **64 676** | 39 107 443 | | 6 | 1 |

Orchestrator share of fresh tokens: 0.23. Cache read (39.1 M) показано окремо, у «витрачені токени» не додано.

## Outcome
| Gate | Runs | Fails | First try | Final |
|---|---|---|---|---|
| scripts/check.sh | 13 | 3 | ✓ | ✓ |
| vitest | 16 | 7 | ✓ | ✓ |
| pnpm arch | 2 | 0 | ✓ | ✓ |

`/run-plan` (SPEC-07, phase `done`, verify_rounds 2, review_round 2): лічильники verify — `0/0/0/0` для обох раундів, бо `verify-1.md`/`verify-2.md` знову записані оркестратором як підсумок (16:35:18 `cat > .claude/sdd/SPEC-07/verify-1.md <<'EOF'`), а не як матриця. За текстом оркестратора: «Verify #1 found 7 Fails» → recheck «All 8 rechecked rows pass». Review round 1: 1 WARNING (A1); round 2: 0.
Resumes: 1 · errors: exit 6.

## Trend
Прямо порівнянного run-у немає: `2026-09-30-spec-05-onboarding-tour` включав spec-creator і 4 researcher-и, тут — лише `/run-plan`. Але дві проблеми з того retro повторились, бо його пропозиції #1, #4 і #6 не застосовано (`git log --since=2026-09-30 -- .claude/agents .claude/skills` → лише перейменування `/implement` → `/run-plan`):
- контрактні прогалини, знайдені посеред реалізації (SPEC-05 #1) — тут 4 прогалини і 2 додаткові implementer-и;
- zsh-глоби без лапок (SPEC-05 #4) — тут 2 з 6 помилок;
- `verify-N.md` як підсумок (SPEC-05 #6) — тут знову `0/0/0/0`.

## Order
1. 14:58 implementation-planner (Phase 1) → 15:00 resume з відповідями → plan.
2. 15:09 W1 contracts (послідовно) → 15:10 W2a ∥ W2c ∥ W2d (3 в одному повідомленні) → 15:15 W2b (чекав W2a, W2c за планом).
3. 15:17 користувач: «fix all four contract gaps» → 15:18 implementer #7 (після W2b через перетин файлів у `reviews/`).
4. 15:21 оркестратор питає про міграцію для AC-2 і **зупиняється** → 16:18 користувач: «so all is done?» → 16:19 #8 AC-2 → 16:21 test-writer. Очікування 57 хв.
5. 16:33 verify #1 → 16:35 fix → 16:39 recheck.
6. 16:40 architecture ∥ bug ∥ security → 16:42 триаж (1 WARNING) → **очікування 83 хв** → 18:05 fix A1 → 18:06 re-review.
7. 18:06 користувач: `column "context_paths" does not exist` → 18:28 повтор → `pnpm db:migrate` → 18:29 verify #2 ∥ Playwright (оркестратор).

## Per agent

### 1. implementation-planner — Plan SPEC-07
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Sonnet, 57 709 fresh; План з Execution-таблицею, `Files owned` без перетинів. |
| Hard | ok | 0 errors, 1 resume (очікуваний Phase 1 → Phase 2). |
| Easy | ok | Відповіді користувача «1 multi, 2a, 3 yes, 4 yes, 5–8 ok» — питання були рішучі. |
| Duplicated | ok | — |
| Missed | **issue** | План не звіряв кожне поле, яке UI показує, з контрактом W1: W2a «Contract gap (AC-42). The W1 `PrContextPreview` has only `{ path, status, text, read_from }`»; «`PrContextOrigin` has only `changed \| default_branch`» (AC-2); W2d — `RunSummary` без `context_fingerprint` (AC-38..40). Наслідок — implementer-и #7 і #8 та міграція `0018` посеред run-у. |
| Hand-off | ok | 37 682 символи, оркестратор переслав по workstream-ах без переписування. |
| Prompt | ok | Промпт дав гілку спеки, HEAD і вказівку перевірити file:line. |

### 2–6. implementer — W1, W2a, W2c, W2d, W2b
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Sonnet; 0.7–4.3 active min кожен. |
| Hard | issue | W2a: `no such file or directory: ./scripts/check.sh` (виклик з `server/`); W2d: client test `7 failed` під час паралельного W2 (причину в звіті не названо). |
| Easy | ok | W2c — 8 tool calls, 0 errors. |
| Duplicated | ok | `plan.md` читають усі (очікувано); W2a перечитав `spec.md` 3×. |
| Missed | ok | Прогалини контракту чесно винесені в «Notes and deviations» — це промах плану, не їхній. |
| Hand-off | ok | W2b сам назвав правку поза owned list: «I edited `reviews/service.ts`, which is outside my owned list». |
| Prompt | ok | Кожен отримав steps, files owned, inner loop. |

### 7–8. implementer — contract gap fixes, AC-2 origin badge
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | — |
| Hard | issue | #7: `no matches found: --include=*.ts`; #8: `--include=*.test.tsx` той самий zsh-глоб, і `sed -i 's/…'` без `''` (gate FAIL 16:20:03, повтор 16:20:09 з `sed -i ''`). |
| Missed | n/a | Обидва існують лише через промах планування (див. 1). |
| Prompt | ok | — |

### 9. test-writer — SPEC-07 tests
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 16% fresh, 88 tool calls — найбільший агент, але покрив server/client/IT/e2e. |
| Hard | issue | 7 vitest fails (ітерації власних тестів) + 2 помилки BSD `sed`: «unescaped newline inside substitute pattern», «undefined label 'est/brief-pr-context.test.ts'». `run-executor.ts` прочитано 6×. |
| Easy | ok | — |
| Missed | ok | e2e-крок не запущено, сказано прямо: «I validated the JSON but did not run the flow». |
| Hand-off | ok | Дві можливі невідповідності специфікації передані у verify #1 → там підтверджені як Fail (AC-31). |
| Prompt | ok | «Already covered (don't duplicate)» — дублю тестів не було. |

### 10, 12, 18. plan-verifier — verify 1, recheck, verify 2
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Sonnet; знайшов 7 Fail, яких test-writer і implementer-и не бачили. |
| Hard | ok | 0 errors. |
| Duplicated | issue (мало) | Recheck — новий агент на 668-символьному промпті, 21 382 fresh, перечитує ті самі файли (`topology` merge, 60% overlap). |
| Missed | ok | Позначив `EC-26`, `UI-8` як Unverified, не Pass. |
| Hand-off | issue | Матриця не дійшла до `verify-N.md` у сирому вигляді — це помилка оркестратора, не verifier-а. |

### 11, 16. implementer — verify-1 fails, fix A1
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | — |
| Missed | ok | Recheck підтвердив усі 8 рядків. |
| Hand-off | ok | — |

### 13–15, 17. reviewers
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 3 паралельно, разом 190 356 fresh; security трасував кожне джерело → sink. |
| Missed | ok | A1 (adapter → `modules/_shared`) знайдено, хоча `pnpm arch` його не ловить («no rule covers that direction»). |
| Duplicated | ok | Перетин читань bug ∥ security (5 файлів) — очікуваний для незалежних перевірок. |
| Prompt | ok | Bug-reviewer мав чіткий скоуп: `git diff 896f72b…` + untracked. |

### Orchestrator
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue | 102 з 102 викликів на Opus; 17 Playwright-викликів (navigate/wait/click/screenshot) теж на Opus. |
| Order | **issue** | 15:21 поставив питання про міграцію AC-2 і не запустив test-writer, хоча той від AC-2 не залежав → 57 хв простою до «so all is done?» (16:18). |
| Relays | ok | Рішення користувача і примітки записувались у `state.json`; recheck просили «against the code, not against the implementer's report». |
| Own work | issue | 18:06 «I didn't save a snapshot of the tree before the fix started» → re-review без точного diff-у. `INSIGHTS.md` перечитано 3×. |
| Missed | **issue** | Згенеровано міграції `0017`, `0018`, але `pnpm db:migrate` не запущено до перевірки в браузері → користувач двічі бачив `column "context_paths" does not exist` (18:06, 18:28), 22 хв. |
| User time | issue | 57 хв (AC-2, див. Order) + 83 хв триажу одного WARNING-а з готовою пропозицією виправлення. Триаж обовʼязковий за `/run-plan`, тому друге — не помилка оркестратора. |

## Duplication
- `.claude/sdd/SPEC-07/plan.md` — 6 implementer-ів, test-writer, 2 verifier-и (очікувано, кожен свій workstream).
- `.claude/sdd/SPEC-07/spec.md` — по 3× у W2a, test-writer, verify 1.
- `server/src/modules/reviews/run-executor.ts` — test-writer 6×; ще planner, W2b, gap-fix, 2 verifier-и.
- `INSIGHTS.md` — orchestrator 3×.

## Topology
| Candidate | Verdict | Reason |
|---|---|---|
| resume plan-verifier:aba6d27 instead of launching plan-verifier:a2e7dc7 — same type, 60% of the smaller read set shared | accept | Recheck — той самий checker, промпт 668 символів; новий агент заново будує контекст (21 382 fresh). Пропозиція #6. |
| merge test-writer:a35d8ea into implementer:a41d954 (one agent, both briefs) — 7 files read by both | reject | `--tests` свідомо відділяє автора тестів від автора коду; саме так знайдено AC-31. |
| resume plan-verifier:aba6d27 instead of launching plan-verifier:a6e3dbb — same type, 67% of the smaller read set shared | reject | Verify #2 — definition of done, має бути свіжим і незалежним від verify #1. |
| merge test-writer:a35d8ea into implementer:ac7dbe7 (one agent, both briefs) — 5 files read by both | reject | Та сама причина, що й для a41d954. |
| fold architecture-reviewer:a832ab3 into the orchestrator or its neighbour — 5 tool calls, 19193 fresh tokens | reject | Незалежний reviewer; перенесення в Opus-оркестратор подорожчає, а не здешевшає. |
| fold architecture-reviewer:acacd64 into the orchestrator or its neighbour — 2 tool calls, 13024 fresh tokens | accept (умовно) | Re-review A1 = «чи зникнув import adapter → modules». Коли це правило буде в `.dependency-cruiser.cjs`, re-review = `pnpm arch` (див. «For engineering-insights»). |
| (manual) merge implementer #7 «contract gap fixes» and #8 «AC-2 origin badge» | accept | Обидва — прогалини контракту; розділені лише через питання про міграцію. Закривається пропозицією #1 (прогалини стають питаннями Phase 1). |
| (manual) concurrency | reject | Скрипт не дав кандидата: maxParallel 3, із 6 помилок жодна не повʼязана з навантаженням (cwd, zsh-глоб, BSD sed). |

## Proposals
| # | Action | File | Change | Evidence | Expected effect |
|---|---|---|---|---|---|
| 1 | Merge | `.claude/agents/implementation-planner.md` | merge «contract gap fixes» і «AC-2 origin badge» у W1: у Phase 1 обовʼязкова таблиця **AC/EC/UI → поле контракту → тип → де зберігається** для кожного значення, яке UI показує або сервер пише; порожня клітинка або нова колонка БД = питання до користувача у Phase 1, не посеред run-у. | 4 прогалини (W2a «Contract gap (AC-42)», AC-2 enum, `RunSummary.context_fingerprint`, EC-7 `not_utf8`); implementer-и #7 + #8 = 117 848 fresh; міграція `0018` посеред run-у. Повтор SPEC-05 #1. | −2 implementer-и (~118 k fresh), −1 зупинка на користувача. |
| 2 | Reorder | `.claude/skills/run-plan/SKILL.md` | launch test-writer together with the pending user question: питання про один пункт не зупиняє незалежні фази; test-writer/verify стартують на решті, пункт добудовується після відповіді. | 15:21 питання → 16:18 «so all is done?» → 16:21 test-writer. | −57 хв span. |
| 3 | Edit | `.claude/skills/run-plan/SKILL.md` | Якщо план генерує міграцію: після Phase 1 спитати один раз і виконати `cd server && pnpm db:migrate` до будь-якої перевірки в браузері або e2e. | 18:06 і 18:28 `column "context_paths" does not exist`; «I need your go-ahead to run `cd server && pnpm db:migrate`». | −22 хв, 0 помилок у браузері користувача. |
| 4 | Edit | `CLAUDE.md` (Gotchas — читають усі агенти) | «Shell — zsh на macOS: беріть глоби в лапки (`--include='*.ts'`) або використовуйте Grep; `sed -i ''` (BSD); для правок коду — Edit, не `sed`». | 2× `no matches found: --include=…` (#7, #8), 2× BSD `sed` у test-writer, 1× `sed -i` без `''` (#8). Повтор SPEC-05 #4. | −5 помилок інструментів за run. |
| 5 | Edit | `.claude/skills/run-plan/SKILL.md` | (a) `verify-N.md` = матриця verifier-а дослівно, не підсумок; (b) перед Fix mode зберегти базу: `git stash create` → SHA у `review-round-N.json`, щоб re-review отримав точний diff. | `quality.sdd.verify` = `0/0/0/0` вдруге; 18:06 «I didn't save a snapshot of the tree before the fix started». Повтор SPEC-05 #6. | Метрики verify в retro; точний скоуп re-review. |
| 6 | Merge | `.claude/skills/run-plan/SKILL.md` | resume plan-verifier verify #1 instead of launching a new recheck agent (recheck лише Fail-рядків); verify #2 лишається новим агентом. | `topology`: 60% спільних читань; recheck 21 382 fresh на промпті 668 символів. | ~−15 k fresh за раунд. |
| 7 | Model | orchestrator prompt | `/run-plan`-оркестратор: Opus → Sonnet для фаз 1–5 (relay, `state.json`, gates, Playwright); Opus лише для триажу. | 102/102 виклики на Opus, 369 723 fresh (23%); 17 Playwright-викликів — механічні. | Нижча вартість найдорожчої частки; перевірити на наступному run-і. |

## For engineering-insights (not recorded here)
- `server/.dependency-cruiser.cjs` не має правила `adapters → modules`: A1 знайшов лише reviewer («no rule covers that direction»), а `src/adapters/astgrep/index.ts:25` досі імпортує `modules/repo-intel/constants.js`. Варто записати в `server/INSIGHTS.md` і додати правило з `pathNot` для astgrep як відомого боргу.
