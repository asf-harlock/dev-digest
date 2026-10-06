# Workflow retro — SPEC-04 Project Context (2026-09-29)

> **Оновлено після пропозицій 1–2.** Цей звіт написано за цифрами всієї сесії, без часового вікна. Після нього скрипт перезапущено з `--from 2026-09-29T17:10:00Z --until 2026-09-29T17:32:00Z`: тепер `metrics.json` і рядок у `history.jsonl` охоплюють лише workflow. Разом 509 954 fresh-токенів, оркестратор 104 293 (частка 0.20), 5.7 активних хвилин, помилок 0. Гейт один: `lint-spec` ✓ з першого разу. Хибного `pnpm test` більше немає.

Session `8096814f-4467-4d3e-a81a-15c51de1c7c7` · span 74.9 хв · active 19.5 хв (оркестратор) · 3 агенти · max parallel 3
Цифри включають перший виклик самого retro.

> **Увага до цифр оркестратора.** Сесія — це не лише workflow. Після 17:41 (запит на `workflow-retro`) оркестратор ~20 хв будував і тестував цей скіл. Його токени, обидві `exit`-помилки й повторні читання `INSIGHTS.md` здебільшого належать тій роботі. Розділити на «workflow» і «решту» скрипт поки не вміє, тому окремої цифри немає: `n/a — немає часового вікна` (пропозиція 2).

## Numbers
| Actor | Model | Active min | Fresh tokens | Output | Cache read | Tools | Errors | Resumes |
|---|---|---|---|---|---|---|---|---|
| orchestrator | claude-opus-5-5 | 19.5 | 239 646 | 59 613 | 8 521 906 | Bash 37, Write 3, Agent 3, SendMessage 1, Read 1, Skill 1 | 2 (exit) | — |
| 1. spec-creator — Spec intake: Project Context feature | claude-opus-5-5 | 7.8 | 361 141 | 24 267 | 3 042 266 | Read 37, Grep 21, Glob 9, SubagentHandback 2, Skill 1, Write 1 | 1 (missing-path) | 1 |
| 2. researcher — R1: prior Project Context impl in git | claude-sonnet-5-5 | 0.7 | 22 290 | 1 280 | 80 875 | Bash 5, SubagentHandback 1 | 0 | 0 |
| 3. researcher — R2: CI/runner review path | claude-sonnet-5-5 | 0.7 | 22 230 | 807 | 94 957 | Bash 6, SubagentHandback 1 | 0 | 0 |
| **Total** | | | 645 307 | 85 967 | 11 740 004 | | 3 | 1 |

Частка оркестратора у fresh-токенах: 0.37.

## Outcome
| Gate | Runs | Fails | First try | Final |
|---|---|---|---|---|
| lint-spec.mjs | 2 | 0 | ✓ | ✓ |
| pnpm test | 1 | 1 | ✗ | ✗ |

`pnpm test` — **хибне спрацювання самого скрипта**. Команда за `gateRuns[2]` — це `node -e '…'`, у тексті якого тестовий рядок `"cd server && pnpm test …"`. `gateOf` ділить команду по `&&` без урахування лапок. `pnpm test` у цій сесії не запускався (пропозиція 1). Реальний гейт workflow — `lint-spec` — пройшов з першого разу.

`/implement` не запускався (`sdd: []`). Resumes: 1 · errors: `exit` 2, `missing-path` 1.

## Trend
Порівнюваного запуску ще немає: `history.previous` порожній, це перший рядок у `history.jsonl`.

## Order
1. 17:10:23 — запит користувача (текст + 8 скріншотів).
2. 17:11:10 — `spec-creator`, фаза 1 (intake), у фоні.
3. 17:16:04 / 17:16:08 — `researcher` R1 і R2, **в одному повідомленні, паралельно**. Обидва закінчили за 0.7 хв (17:16:53 / 17:16:51).
4. 17:16–17:25 — очікування відповідей користувача.
5. 17:28:45 — resume `spec-creator` (фаза 2) з відповідями й підсумком досліджень. Закінчив 17:31:35.
6. 17:31 — лінт від оркестратора, pass.
7. 17:34:40 — виправлення від користувача: визначення `spec-creator` мало власні інструменти для ресерчу (WebSearch/WebFetch/Figma).

## Per agent

### 1. spec-creator — Spec intake: Project Context feature
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok — позначку **відхилено** | `flags`: «top-tier model, 99% read-only…», `freshShare` 0.56. Але результат фази 1 — це судження, а не пошук: 25 знахідок з `file:line`, серед них F2 (якщо читати PR head, автор PR може послабити правила, за якими судять його ж PR) і F7 (мітка `spec-${i}` ламає сценарій «Перевірка»). Обидві знахідки прямо увійшли в AC. Щоб перевірити Sonnet, потрібен порівнюваний запуск, одних цих даних замало. |
| Hard | ok | Одна помилка `missing-path`: Grep по вигаданому шляху `contracts/adapters.ts`. Вона ні на що не вплинула. Лінт не запускав («I have not linted it, because I have no shell here»), але так задумано: лінт — крок викликача. |
| Easy | ok | Номер SPEC-04, розміщення, 9 заголовків: усе з першого разу. `lint-spec` пройшов з першого разу, resume лише 1, за 7 хв після resume правок не було. |
| Duplicated | ok | `reviewer-core/src/review/run.ts` читав і R2, але це оркестратор сам указав R2 на `run.ts:26-27`, тобто перевірку, а не дубль. |
| Missed | ok | Після hand-back фази 2 користувач нічого не виправляв у специфікації. Виправлення о 17:34 стосувалося **визначення** агента, а не його роботи. |
| Hand-off | issue (низький) | `reportChars` 27 594 на дві фази. Питання одразу були українською, їх можна було пересилати як є. Але таблицю знахідок і підходи оркестратор переписав у стислий підсумок для користувача (≈ 1/5 обсягу). Великий звіт — це ціна, яку платить контекст оркестратора. |
| Prompt | ok | `promptChars` 9 206: вимоги дослівно, 8 шляхів до зображень з описами, окремі пункти для перевірки. Одна зайва здогадка: «probably L05 or similar» — `specs/lessons/` порожній, агент це підтвердив. |

### 2. researcher — R1: prior Project Context impl in git
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Sonnet, 22 290 fresh, 0.7 хв, 5 Bash. |
| Hard | ok | Помилок немає. |
| Easy | ok | Питання, яке можна перевірити, і готові git-команди в промпті, відповідь «ніколи не існувало» з sha. |
| Duplicated | ok | `sharedReads` без R1. |
| Missed | ok (низький) | Сам зазначив, що гілки `demo/*`, `test/*` окремо не перевіряв. На специфікацію це не вплинуло. |
| Hand-off | ok | 5 781 символів, розділ «Could not find» чесний. |
| Prompt | ok | 1 139 символів, рядок із запиту `spec-creator` майже без змін. |

### 3. researcher — R2: CI/runner review path
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | ok | Sonnet, 22 230 fresh, 0.7 хв. |
| Hard | ok | Помилок немає. |
| Easy | ok | Однозначна відповідь: єдиний виклик — `run-executor.ts:217`. |
| Duplicated | issue (дрібний) | `rereads`: `eval-ci.ts` ×2, `specs/03-intent-layer.md` ×2 у межах одного агента. |
| Missed | ok | Прямо закрив Q12 і F25. |
| Hand-off | ok | 5 142 символи. |
| Prompt | ok | 1 006 символів. |

### Orchestrator
| Lens | Verdict | Evidence |
|---|---|---|
| Fit | n/a | Цифри змішані з побудовою скіла (див. увагу вгорі). |
| Order | ok | R1 і R2 запущено в одному повідомленні (`launch` 17:16:04 / 17:16:08). Питання до користувача пішли, поки ще йшли дослідження: це заощадило раунд очікування. |
| Relays | issue | `spec-authoring/SKILL.md`, крок 2, каже спершу передати звіти досліджень **дослівно** й отримати оновлений intake, а вже потім питати користувача. Оркестратор пропустив оновлений intake (жодне дослідження не змінило пріоритет знахідки) і передав R1/R2 **стисло** в тому ж resume, що й відповіді (`prompts/spec-creator-ad925b7.md`, Resume 1). Результат не постраждав, але правило й практика розійшлися. |
| Own work | issue (низький) | `sharedReads`: оркестратор сам перечитав `simple-git.ts` о 17:25, щоб відповісти на Q1, хоча F11 уже цитував `simple-git.ts:77-88`. Частково виправдано: знадобилися `CLONE_DEPTH` і `clonePathFor`, яких у F11 не було. |
| User time | ok | `spanMin` 74.9 проти `activeMin` 19.5. Очікування 17:16→17:25 — це час, поки користувач відповідав на 3 блокуючі питання. Уникнути його не можна: Q1 змінив обсяг специфікації. |

## Duplication
- `server/src/adapters/git/simple-git.ts` — orchestrator ×1, spec-creator ×1 (див. Own work).
- `reviewer-core/src/review/run.ts` — spec-creator ×1, researcher R2 ×1. Це свідома перевірка, не дубль.
- `server/INSIGHTS.md`, `INSIGHTS.md` — orchestrator ×3, spec-creator ×1. Оркестратор читав їх під час запису інсайтів наприкінці сесії, до workflow це не стосується.
- `rereads`: orchestrator — `specs/04-project-context.md` ×3 (лінт, перевірка заголовків, approve), `spec-authoring/SKILL.md` ×2. R2 — `eval-ci.ts` ×2, `specs/03-intent-layer.md` ×2.

## Proposals
| # | File | Change | Evidence | Expected effect |
|---|---|---|---|---|
| 1 | `.claude/skills/workflow-retro/scripts/collect.mjs` | У `gateOf` перед діленням по `&&`/`;`/`\|` вирізати вміст рядків у лапках `'…'`/`"…"`. | `quality.gates["pnpm test"]` — хибний fail із `node -e '…"cd server && pnpm test…"'` | Жодних вигаданих гейтів в Outcome. |
| 2 | `.claude/skills/workflow-retro/scripts/collect.mjs` + `SKILL.md` | Опції `--from <ts>` / `--until <ts>`, які обрізають і рядки оркестратора, і агентів. У SKILL: коли сесія змішана, вказати вікно від запуску першого агента до останнього гейта. | Тут ~20 хв після 17:41 — побудова скіла всередині цифр оркестратора (`orchestratorShareFresh` 0.37, обидві `exit`-помилки) | Чиста частка оркестратора і порівнювані рядки в `history.jsonl`. |
| 3 | `.claude/skills/spec-authoring/SKILL.md` («Running spec-creator», кроки 2–3) | Узаконити те, що спрацювало: якщо жодне блокуюче питання не має позначки `pending R<n>`, питати користувача паралельно з дослідженням; якщо дослідження не змінює пріоритет жодної знахідки, пропустити раунд оновленого intake і передати звіти **дослівно** разом із відповідями. | Relays: крок пропущено без втрат. Resume 1 передав R1/R2 стисло, що суперечить «verbatim» | Мінус один resume і ~5 хв очікування на кожну специфікацію, правило збігається з практикою. |

Позначку Fit для `spec-creator` («a cheaper model may do») відхилено, без пропозиції. Повернемось до неї, коли в `history.jsonl` з'явиться другий запуск `spec-creator → researcher`.

## For engineering-insights (not recorded here)
Уже записано цієї сесії: `server/INSIGHTS.md` (клон повністю перезаписується `reset --hard` при кожному sync) і корінь `INSIGHTS.md` (дедуплікація usage в транскриптах за `message.id`). Нового немає.
