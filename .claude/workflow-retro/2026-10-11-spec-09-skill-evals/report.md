# Workflow retro — SPEC-09 eval case editor, skill evals, trend (2026-10-11)

Session `ef4bc9b9-6483-4696-af0e-f03a00f40d8d` · span 187 хв · active (оркестратор) 49.2 хв · 23 агенти · max parallel 4
Числа включають перший виклик цього ретро. Вікно не задавалось (`session.window = null`): у сесію потрапили й не-workflow дрібниці (гілка, вимкнення GitHub Actions, коміти) — вони малі порівняно зі spec→plan→build.
Судження нижче спираються на `metrics.json` і на hand-back-и, які оркестратор бачив у цій сесії; файли `prompts/` і `reports/` по одному не відкривались.

## Numbers
| Actor | Model | Active min | Fresh tokens | Output | Cache read | Tools | Errors | Resumes |
|---|---|---|---|---|---|---|---|---|
| orchestrator | sonnet-5-5 | 49.2 | 481,283 | 135,278 | 27,559,405 | 106 | 1 | — |
| 1. spec-creator — Spec intake for L06 stretch tasks | opus-5-5 | 11.1 | 594,663 | 68,728 | 5,231,826 | 79 | 0 | 3 |
| 2. researcher — R1: upstream skill-owned eval cases | sonnet-5-5 | 1.7 | 163,182 | 1,025 | 1,762,458 | 47 | 1 | 0 |
| 3. implementation-planner — Plan SPEC-09 skill evals | sonnet-5-5 | 8.6 | 362,915 | 715 | 2,714,479 | 41 | 3 | 1 |
| 4. implementer — W1 contracts, phase A | sonnet-5-5 | 1.1 | 48,057 | 371 | 264,638 | 10 | 1 | 0 |
| 5. implementer — W2 server, phase A | sonnet-5-5 | 5.8 | 179,395 | 4,086 | 4,129,881 | 45 | 0 | 0 |
| 6. implementer — W3 client, phase A | sonnet-5-5 | 14.3 | 318,585 | 1,017 | 17,984,544 | 93 | 0 | 0 |
| 7. test-writer — Phase A tests | sonnet-5-5 | 5.1 | 154,984 | 1,138 | 2,398,132 | 34 | 0 | 0 |
| 8. implementer — W1 contracts, phase B | sonnet-5-5 | 1.5 | 69,307 | 143 | 458,688 | 13 | 0 | 0 |
| 9. implementer — W2 server, phase B | sonnet-5-5 | 6.5 | 216,197 | 1,836 | 6,944,793 | 59 | 0 | 0 |
| 10. implementer — W3 client, phase B | sonnet-5-5 | 7.3 | 178,562 | 3,056 | 5,774,385 | 59 | 1 | 0 |
| 11. test-writer — Phase B tests | sonnet-5-5 | 7.9 | 287,854 | 44,719 | 6,352,045 | 52 | 0 | 0 |
| 12. implementer — W1 contracts, phase C | sonnet-5-5 | 0.6 | 37,598 | 1,022 | 223,036 | 10 | 0 | 0 |
| 13. implementer — W2 server, phase C | sonnet-5-5 | 1.3 | 41,533 | 193 | 465,743 | 14 | 0 | 0 |
| 14. implementer — W3 client, phase C (+F1/F2 fix) | sonnet-5-5 | 7.5 | 295,960 | 479 | 5,300,441 | 57 | 0 | 1 |
| 15. test-writer — Phase C tests | sonnet-5-5 | 3.1 | 126,944 | 7,162 | 2,112,790 | 32 | 3 | 0 |
| 16. plan-verifier — Verify #1 | sonnet-5-5 | 8.2 | 264,062 | 494 | 11,380,919 | 73 | 1 | 0 |
| 17. plan-verifier — Re-verify F1/F2 | sonnet-5-5 | 0.8 | 29,549 | 45 | 97,872 | 9 | 0 | 0 |
| 18. architecture-reviewer | sonnet-5-5 | 2.2 | 109,293 | 720 | 1,651,365 | 34 | 1 | 0 |
| 19. general-purpose — Bug review | sonnet-5-5 | 4.8 | 222,691 | 1,059 | 4,900,508 | 36 | 0 | 0 |
| 20. security-reviewer | sonnet-5-5 | 1.6 | 113,733 | 347 | 1,131,970 | 17 | 0 | 0 |
| 21. implementer — Fix round 1 (B1,B2,B3) | sonnet-5-5 | 2.6 | 77,873 | 195 | 896,114 | 19 | 0 | 0 |
| 22. general-purpose — Bug re-review | sonnet-5-5 | 1.1 | 89,862 | 2,101 | 733,049 | 16 | 0 | 0 |
| 23. plan-verifier — Verify #2 | sonnet-5-5 | 3.5 | 87,481 | 432 | 1,502,672 | 33 | 2 | 0 |
| **Total** | | | 4,551,563 | 276,361 | 111,971,753 | | 14 | |

Orchestrator share of fresh tokens: 0.11. `cache_read` (111.97M) — переважно один і той самий контекст, перечитаний щоходу; у «витрачених токенах» не рахується. Єдиний Opus-агент — spec-creator (594,663 fresh).

## Outcome
| Gate | Runs | Fails | First try | Final |
|---|---|---|---|---|
| lint-spec.mjs | 5 | 0 | pass | pass |
| vitest | 27 | 13 | pass | **fail** |
| scripts/check.sh | 38 | 15 | pass | pass |
| pnpm typecheck | 1 | 0 | pass | pass |

Читати обережно: `vitest finalPass=false` — це евристика над виводом; після останнього повного `.it`-прогону лишились 5 базових падінь (`skills-stats.it` ×4, `skills.it` 404) і одне нестабільне (`onboarding-tour`), усі записані в `state.json` до реалізації. 11 з 15 падінь `check.sh` — implementer-и, переважно очікувані (B1/C1 навмисно ламають typecheck, поки W2/W3 не підлаштуються).
Не рахується в `quality.gates`: тричі поспіль оркестратор запускав цикл гейтів у zsh без `${=g}` і отримував usage (exit 2) замість PASS/FAIL — це видно в транскрипті, але детектор їх не зафіксував.

`/run-plan`: 2 раунди верифікації, 2 раунди ревʼю. Рядки `quality.sdd` у `metrics.json` (verify-1: Pass 0 / Unverified 4; verify-2: Pass 2) відображають стиснуті файли `verify-1.md`/`verify-2.md`, а не повні матриці: реально verify #1 дав 129 Pass / 1 Fail (AC-39) / 3 Unverified із 133 ID, verify #2 — 131 Pass / 2 Unverified. Ревʼю: 3 WARNING (усі виправлені), CRITICAL — 0.
Resumes: 5 · errors: exit 12, other 2.

## Trend
Порівняння з `2026-10-11-spec-08-eval-pipeline` (той самий набір типів агентів: spec-creator → planner → implementers → verifiers → reviewers; 19 агентів):
- fresh tokens: 4,551,563 vs 4,138,990 → +412,573 (+10%)
- active min (orchestrator): 49.2 vs 28 → +21.2; span 187 vs 117.3 хв → +69.7
- resumes: 5 vs 7 → −2
- errors: 14 vs 31 → −17
- gates first-try: 4 з 4 vs 7 з 9
- orchestrator share: 0.11 vs 0.14 → −0.03
Різницю обсягу дає більший SPEC (59 AC / 46 EC, три фази) і два цикли переписування spec (див. Orchestrator).

## Order
1. 12:01 spec-creator (фаза 1) · 12:02 user: «disable all GitHub Actions» (не-workflow)
2. 12:06:31 питання користувачу Q1–Q3 → 12:20:50 researcher R1 (чекав 14 хв на відповідь) → 12:22:52 resume spec-creator
3. 12:47 implementation-planner (фаза 1) на spec «лише skills» → 13:11 користувач змінює охоплення → 13:11 resume spec-creator, 13:16 resume planner (фаза 2)
4. 13:22 `/run-plan` → 13:25 W1 (A) → 13:26 W2∥W3 (A) → 13:45 test-writer A → 13:50 W1 (B) → 13:52 W2∥W3 (B) → 14:00 test-writer B → 14:08 W1 (C) → 14:09 W2∥W3 (C) → 14:15 test-writer C
5. 14:18 plan-verifier #1 → 14:27 resume W3 (F1/F2) → 14:29 re-verify ∥ architecture ∥ bug ∥ security (4 паралельно) → fix round → bug re-review ∥ verify #2
Паралельність: W2∥W3 у кожній фазі (×3) і чотири одночасних на ревʼю. Очікування користувача (7 `AskUserQuestion`): 138 хв різниці `spanMin − activeMin` включають і роботу агентів у фоні, не лише очікування.

## Per agent

### 1. spec-creator — Spec intake (Opus, 3 resumes)
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | issue (спірно) | flag «top-tier model, 80% read-only, 16 writes» · 594,663 fresh = 13% (`freshShare`). Флаг був у 3 з 4 попередніх ретро. Після SPEC-08 агент уже переведений на Sonnet (`model: sonnet` у frontmatter з коментарем-експериментом, коміт `b25e4bd`); у цьому прогоні він ішов на Opus лише тому, що користувач явно попросив «Use model Opus» — тож це **не** порівнянний прогін експерименту. Фаза 1 — читання; судження (F1 «скріншот = skill editor», підходи A/B/C) варте уваги, але чи вистачає Sonnet — досі не перевірено |
| Hard | ok | 79 tool calls, 0 errors; найскладніше — суперечність brief ↔ скріншот, яку він сам виніс як F1 |
| Easy | ok | формат intake і lint-spec: 5 запусків, 0 fail |
| Duplicated | issue | читав `specs/08-eval-pipeline.md`, `server/src/db/schema/eval.ts`, `knowledge.ts` — ті самі файли потім перечитав planner (`sharedReads`) |
| Missed | ok | F1 і питання охоплення були правильні; перше охоплення «лише skills» задав оркестратор, а не агент (див. Orchestrator) |
| Hand-off | issue | звіти 39,485 симв. за 4 hand-back; специфікація 287 рядків → 59 AC / 46 EC, понад власний ліміт розміру; сам агент запитав про розбиття (Q-1) |
| Prompt | ok | prompt 4,916 симв., brief + скріншот + шлях до фігури |

### 3. implementation-planner (2 фази, 1 resume)
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | read-only за визначенням; 8.6 хв active, 362,915 fresh |
| Hard | issue | 3 `exit` errors; фаза 1 ішла на spec «лише skills», яку користувач змінив через ~25 хв |
| Easy | ok | верифікація upstream-фактів `git show` виконана і знайшла неточності (lift unit, 200 KB = 204 800 байт) |
| Duplicated | issue | `specs/09-skill-evals.md` ×3, `client/src/lib/hooks/eval.ts` ×2, ті самі INSIGHTS, що й spec-creator |
| Missed | issue | у блоці Contracts не було `link_enabled`, плану довелось виправляти специфікацію (resume spec-creator) — виловлено самим planner-ом |
| Hand-off | issue | 57,603 симв. на 2 hand-back-и; planner не пише файл (read-only), оркестратор мусив **перенабрати** план у `.claude/sdd/SPEC-09/plan.md` |
| Prompt | ok | prompt 2,239 симв. + відповіді Q1–Q10 |

### 6. implementer — W3 client, phase A
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | найбільший implementer: 93 calls, 14.3 хв, 17.98M cache_read (довгий контекст) |
| Hard | ok | вдарився об `no-private-component-from-outside-app` (заборона `_components/` у `src/components/`), перебудував структуру в сестринські папки — записано в `client/INSIGHTS.md` |
| Easy | ok | 0 errors |
| Duplicated | ok | `client/CLAUDE.md` ×1 |
| Missed | ok | після нього лише очікувані зміни тестів |
| Hand-off | ok | звіт 11,111 симв.: таблиця «крок → зміна», список змінених існуючих асерцій |
| Prompt | ok | prompt 2,945 симв., чітка межа файлів |

### 11. test-writer — Phase B
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 287,854 fresh, 52 calls; написав D7-тест паритету промптів і 25 Docker-тестів |
| Hard | issue | output 44,719 токенів — найбільший output серед агентів: багато тестового коду |
| Easy | ok | 0 errors, жодного бага в реалізації |
| Duplicated | issue | `scripts/check.sh` ×3, `server/src/db/schema/eval.ts` |
| Missed | ok | EC-24 «без error-логу» покритий лише hermetic-тестом (сам агент це зазначив) |
| Hand-off | ok | звіт 8,980 симв., перелік файлів і кількостей |
| Prompt | ok | prompt 4,133 симв. |

### 16. plan-verifier — Verify #1
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 73 calls, 8.2 хв; сам повторно прогнав усі гейти і Docker-набір |
| Hard | issue | 11.38M cache_read — найбільший серед verifier-ів; матриця на 133+ ID |
| Easy | ok | знайшов реальну ваду (AC-39: Escape для hover-тултіпа; pointer-leave на всьому plot) |
| Duplicated | issue | `scripts/check.sh`, `specs/09` ×2 |
| Missed | ok | не пропустив, F1 підтверджений повторною верифікацією |
| Hand-off | issue | матриця велика; оркестратор зберіг лише стисле резюме (`verify-1.md`), бо «зберегти як є» означало б перенабрати |
| Prompt | ok | prompt 1,540 симв. |

### 19. general-purpose — Bug review
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 3 WARNING (B1 витік стану між скілами, B2 порожній PATCH, B3 гонка `replaceCase`) — усі реальні й виправлені |
| Hard | ok | запускав `tsx` у scratchpad, щоб довести поведінку `pasted-diff` |
| Easy | ok | 0 errors |
| Duplicated | issue | `server/src/modules/eval/service.ts` ×3 |
| Missed | ok | повторне ревʼю підтвердило B1–B3 і нових не знайшло |
| Hand-off | ok | таблиця + `findings-json` за схемою |
| Prompt | ok | prompt 2,579 симв. + перелік зон трасування |

### 23. plan-verifier — Verify #2
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | дельта-матриця, повний `.it` з 6 падіннями, усі відомі |
| Hard | issue | 2 errors (`other` + `exit`); повторно намагався закрити EC-34 пробою у scratchpad — вдалось |
| Easy | ok | gate-и повторені, `drizzle-kit check` чисто |
| Duplicated | ok | дельта, а не повний перелік |
| Missed | issue | **помилково заявив**, що `DiffViewer.test.tsx` не має `highlightRange`-тесту; оркестратор перевірив `grep` — тест є (рядок 46) |
| Hand-off | issue | неточне твердження довелось виправляти вручну в `verify-2.md` |
| Prompt | ok | prompt 2,196 симв. |

### Решта агентів — єдиний вердикт
Агенти 2 (researcher R1), 4/8/12 (W1 contracts A/B/C), 5/9/13 (W2 server A/B/C), 7/15 (test-writer A/C), 10 (W3 B), 14 (W3 C + fix), 17 (re-verify), 18 (architecture-reviewer), 20 (security-reviewer), 21 (fix round 1), 22 (bug re-review):
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok, з двома спостереженнями | W1-contracts: 48,057 / 69,307 / 37,598 fresh за 10–13 calls — малі правки в двох файлах, але окремий старт кожного разу. architecture/security: 109,293 / 113,733 fresh, 0 знахідок, обидва з машинним доказом (`pnpm arch`, grep-перелік) |
| Hard | ok | `exit` errors у W1 A (очікуваний typecheck), W3 B, test-writer C ×3 — всі ловились у межах їхніх гейтів |
| Easy | ok | реальні баги в реалізації: 0 від test-writer-ів, 0 від architecture/security |
| Duplicated | issue (помірно) | `scripts/check.sh` прочитаний 10 акторами (test-writer a416c1c ×4); `server/src/modules/eval/service.ts` — 13 акторами |
| Missed | ok | W3 C: лишився F1/F2 → виправлено resume |
| Hand-off | ok | звіти 2–14 тис. симв. у структурі «крок → зміна → гейти» |
| Prompt | ok | prompt 1.0–4.7 тис. симв.; жодних зайвих resume крім F1/F2 |

### Orchestrator
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | 125 викликів, 11% fresh, 106 tools: 49 Bash, 23 Agent, 7 AskUserQuestion |
| Hard | issue | тричі поспіль запускав цикл гейтів у zsh без `${=g}` і отримував usage замість PASS/FAIL, поки не з'ясував причину (word splitting) — цього немає в `quality.gates`, але є в транскрипті |
| Easy | ok | `W2∥W3` у кожній фазі; чотири ревʼю/верифікація в одному повідомленні |
| Duplicated | issue | `specs/09-skill-evals.md` ×3, `client/INSIGHTS.md` ×3, `server/INSIGHTS.md` ×4, `.claude/skills/run-plan/SKILL.md` ×2 (`rereads`) |
| Missed | issue | двічі змінювалось охоплення: 12:42 «q2 q3 стосується skills, ти впевнений?» → оркестратор погодився з висновком, не перечитавши brief (де «по всіх прогонах **агента**» і «тим самим роутом») → 13:10 «Evals є і для агентів, і для скілів». Наслідок: spec переписано (+266/−176 рядків), planner фази 1 працював над застарілим охопленням |
| Hand-off | issue | перенабір плану (planner без `Write`) у `plan.md`; спека/план у відповідях користувачу 4 рази повторювались у підсумках |
| Prompt | ok | промпти агентам — шляхи й обмеження файлів, не вставлені тексти |
| Order | issue | R1 запущено лише після відповіді користувача (12:06:31 → 12:20:50 = 14 хв), хоч spec-creator просив R1 одразу, а питання Q1–Q3 від R1 не залежали як блокер |
| Relays | ok | вердикт + таблиця для рішень користувача, звіти повністю не вставлялись |
| Own work | issue | перенабір `plan.md`; сам виконував пошук `grep` для твердження verifier-а (виправдано, коректність) |
| User time | ok | 7 питань, здебільшого обов'язкові за skill (статус `draft`, міграції ×2, triage), решта — рішення користувача щодо охоплення |

## Duplication
- `specs/09-skill-evals.md` — прочитаний 11 акторами (orchestrator ×3, planner ×3, implementer-и ×1–4 кожен, test-writer, verifier-и). Очікувано: це вимога, але 3 читання planner-ом і 3 оркестратором — зайві.
- `scripts/check.sh` — 10 акторів, test-writer a416c1c ×4, implementer a0ff7d7 ×3: щоразу читають довідку скрипта замість того, щоб мати її в промпті/визначенні.
- `server/src/modules/eval/service.ts` — 13 акторів; `server/src/db/schema/eval.ts` — 9; обидва з contracts-файлами читали spec-creator, planner, W1/W2.
- `client/INSIGHTS.md`, `server/INSIGHTS.md` — по 4–5 акторів (обов'язково за правилом репо «прочитати INSIGHTS модуля»).
- Один факт у двох звітах: upstream-схема `eval_runs` описана і в R1, і в planner-а (planner перевіряв firsthand — дублювання свідоме).

## Topology
| Candidate | Verdict | Reason |
|---|---|---|
| merge test-writer:a19a65e into implementer:a9512f0 | reject | тести мають писатись незалежно від реалізації; цей test-writer не знайшов жодного бага — саме тому, що перевіряв чужий код |
| merge implementer:abd597e into implementation-planner:a56ef05 | reject | planner за визначенням read-only і не пише код |
| merge implementation-planner:a56ef05 into spec-creator:a152927 | reject | spec ≠ plan: різні фази SDD, між ними рішення користувача |
| resume implementer:a0ff7d7 instead of launching implementer:a84e30d (W3 A → B) | reject | W3-A уже має 17.98M cache_read; resume тягнув би цей контекст у B. Кінцевий виграш невідомий (n/a) |
| resume implementer:abd597e instead of launching implementer:a9512f0 (W2 A → B) | reject | те саме; крім того, фаза B починається з нової міграції і нового контракту |
| merge implementer:a333f74 into implementation-planner:a56ef05 | reject | тут planner → W1 contracts B: різні ролі |
| resume general-purpose:abcaabb instead of launching general-purpose:a468996 | **accept** | рев'ю-раунд 2 — це «твої попередні id, перевір виправлення»; 67% читань збігаються (8 файлів), fresh = 89,862 |
| resume implementer:a333f74 instead of launching implementer:a9512f0 (W1 B → W2 B) | reject | W1 — контракти, W2 — сервер; розділені навмисно |
| split spec-creator:a152927 (3 resumes, 13% fresh) | reject | resume були змістовні (відповіді користувача, F-правки), а не виправлення; окремий агент на кожну фазу втратив би накопичені знання |
| run spec-creator:a152927 on Sonnet for one comparable run (80% read-only) | **already in place** | `model: sonnet` у frontmatter з часів SPEC-08; цей прогін відхилився лише через явну вимогу Opus від користувача. Наступний прогін без перевизначення моделі дасть порівнянні дані |
| (manual) fold W1 contracts C (37,598 fresh, 8 calls) into W2 server C | accept | зміна — одне поле `cost_usd` у двох копіях; W1 A/B (48,057 / 69,307) теж малі, але там по кілька типів |
| (manual) test-writer A паралельно з W1 B | reject | B1 навмисно ламає typecheck; test-writer A гнав би гейти по зламаному дереву |

## Proposals
| # | Action | File | Change | Evidence | Expected effect |
|---|---|---|---|---|---|
| 1 | Edit | `scripts/check.sh` | додати гейт `all <pkg>` (typecheck, lint, arch, test, по одному PASS/FAIL-рядку) і `all` для всіх пакетів | оркестратор тричі підряд зламав цикл у zsh (word splitting), 10 викликів на цикл | −3 марних цикли по 10 викликів на прогін; один виклик на раунд гейтів |
| 2 | Edit | `.claude/agents/implementation-planner.md` | дозволити `Write` лише в `.claude/sdd/<SPEC>/plan.md` і писати туди фінальний план | `reportChars` 57,603 на 2 hand-back-и; оркестратор перенабирав план вручну; run-plan вимагає «save its final message» | закрито ручний перенабір (1 Write, ризик дрейфу тексту); токенний ефект n/a |
| 3 | Edit | `.claude/agents/implementation-planner.md` | якщо крок контрактів — одне поле/тип, призначати його W2 server, а не окремому W1 | W1 C: 37,598 fresh за 8 calls (0.8% fresh); W1 A/B: 48,057 / 69,307 | до −37,598 fresh на фазу з малим контрактом |
| 4 | Edit | `.claude/skills/run-plan/SKILL.md` | в Phase 4 крок 4: re-review = SendMessage тому ж reviewer-у, не новий `Agent` | topology: abcaabb → a468996, overlap 0.67, fresh 89,862 | до −89,862 fresh на раунд ревʼю |
| 5 | Reorder | orchestrator prompt | запускати `researcher` із запитів spec-creator одразу після hand-back, до `AskUserQuestion`, якщо дослідження не залежить від відповіді | 12:06:31 питання → 12:20:50 R1 (14 хв очікування); R1 зайняв 1.7 хв active | до −14 хв wall-clock на критичному шляху |
| 6 | Model | `.claude/agents/spec-creator.md` | spec-creator фаза 1 (intake): Opus → Sonnet на один порівнянний прогін | `model: sonnet` уже стоїть; цей прогін на Opus через явну вимогу користувача | **вже застосовано раніше**; змін немає; наступний прогін без явного перевизначення моделі = порівнянний експеримент |
| 7 | Edit | `.claude/agents/test-writer.md` і `.claude/agents/plan-verifier.md` | вставити 4-рядкове usage `scripts/check.sh` у визначення замість читання скрипта | `scripts/check.sh` прочитано 10 акторами; test-writer a416c1c ×4, a19a65e ×3, a0ff7d7 ×3 | до −10 читань одного файлу; токенний ефект n/a |

## For engineering-insights (not recorded here)
None. (`scripts/check.sh` у zsh-циклі без `${=g}` — проблема інструмента, її закриває Proposal 1, а не запис. Хибне твердження verify #2 про `DiffViewer.test.tsx` — похибка агента, не знання про код. Знання про код цього прогону вже записані в `client/INSIGHTS.md` і `server/INSIGHTS.md`.)

## Applied (2026-10-11, за рішенням користувача «давай всі»)
| # | Статус | Де |
|---|---|---|
| 1 | застосовано | `scripts/check.sh`: гейт `all` (`check.sh all`, `check.sh <pkg> all`, `check.sh all <gate>`); перевірено: `check.sh all` — 10 PASS, exit 0 |
| 2 | застосовано | `.claude/agents/implementation-planner.md`: `Write` лише для `.claude/sdd/SPEC-NN/plan.md` |
| 3 | застосовано | `.claude/agents/implementation-planner.md`: правило розміру контрактного workstream (одне поле/тип + W2 ≤ 3 кроки → у W2) |
| 4 | застосовано | `.claude/skills/run-plan/SKILL.md` Phase 4 крок 4: re-review через `SendMessage` тому ж reviewer-у |
| 5 | застосовано | `.claude/agents/spec-creator.md`: запити без `after Q<n>` запускаються одразу, до відповіді користувача |
| 6 | вже було | `model: sonnet` у frontmatter з SPEC-08; зміни не потрібні |
| 7 | застосовано | `.claude/agents/test-writer.md`, `.claude/agents/plan-verifier.md`: usage `check.sh` вставлено |
Не перевірено: що agent-и справді слідують новим рядкам (це видно лише в наступному ретро).
