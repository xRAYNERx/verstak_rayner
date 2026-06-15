# Verstak Competitive Improvement Roadmap

> Документ для передачи реализации (помощник / Codex). Спроектировано на реальном коде verstak (миграции 1–15, существующая мультиагентная инфра, plans/undo/verify/review/artifacts). Инкрементально, без «V3 одним PR», без слома `system-layer.ts`, провайдер-контрактов и старых миграций.

---

## 1. Executive summary

Verstak уже не MVP-чат, а **контролируемый multi-provider agent desktop**. Бо́льшая часть «продвинутых» фич конкурентов (Codex/Claude Code/Antigravity) у Verstak либо есть инфраструктурно, либо строится тонким слоем поверх уже готового — потому что фундамент заложен заранее: `run_id` на каждый `ai:send`, `audit_log`/`run_inputs`/`plan_steps` с execution-trace, sub-sessions + sub-queue + delegate/orchestrate/swarm, per-file undo/checkpoint, verify-раннер, Explicit Review, artifacts.

**Главный вывод:** следующий скачок — **не «ещё 5 провайдеров», а сделать работу агента ВИДИМОЙ, УПРАВЛЯЕМОЙ и ДОКАЗУЕМОЙ.** Три P0-фичи (Multi-agent Manager, Verification Artifact, Dev Task Flow) превращают разрозненные кнопки контроля в продуктовую ценность и закрывают ключевые отставания, **усиливая уникальную позицию Verstak, а не копируя Cursor**.

**Дисциплина:** каждая фича — слой поверх существующего, 4–5 откатываемых фаз с тегами, `npm run type && npm run test:fast` между фазами, новые таблицы только append-миграцией.

### Кросс-каттинг решения (навигатор, обязательно к соблюдению)
- **Единая таблица `agent_runs`.** Multi-agent Manager (lifecycle задачи) и Crash-resume (живой прогресс + stale-детект) проектировались независимо и оба ввели `agent_runs`. **Это ОДНА таблица** — Manager даёт поля задачи (owner/status/counters), Crash-resume добавляет `turn_index`/`last_tool_name`/`last_checkpoint_id`/`updated_at`. Реализуется в Multi-agent Manager (P0), Crash-resume (P1) лишь **дополняет** её колонками своей миграцией. Не плодить две.
- **Последовательные миграции.** Каждая фича застолбила «v16». Реальный порядок по мере внедрения: **16 = agent_runs + agent_run_events** (Manager), **17 = verifications** (Verification Artifact), **18 = dev_tasks/dev_task_checks** (Dev Task Flow), **19 = agent_runs ALTER + (опц.) review_findings**. Финальный version присваивается в момент мержа — append-only, не править предыдущие.
- **Вынести `buildAgentTree`** из `AgentsPanel.tsx` в `src/lib/agent-tree.ts` ПЕРВЫМ (его переиспользуют Manager и Agents-панель).

---

## 2. Где Verstak силён (не трогаем — это ров)

- **8 провайдеров (API + CLI) + per-chat provider/model** — мультипровайдерная отказоустойчивость, которой нет у Cursor/Claude Code.
- **5 режимов агента + mode-policy + path-policy + secret-scanner + command-denylist** — слой контроля/безопасности (после security-hardening — 11 закрытых уязвимостей).
- **Мультиагент УЖЕ построен:** sub-sessions, sub-queue (семафор/отмена), delegate/orchestrate/swarm, дерево делегирования с лимитами, AgentsPanel.
- **Российские коннекторы:** 1С OData, Битрикс24, Я.Директ/Диск, Google Sheets, SSH, Telegram — **ров, которого нет у западных IDE-агентов**.
- **Checkpoint + per-file undo, cost controller, context sliding window, skills first-class, artifacts, workflows.**

---

## 3. Где Verstak отстаёт

| # | Отставание | Конкурент | Текущее состояние |
|---|---|---|---|
| 1 | Нет high-level **командного центра задач** | Antigravity (multi-agent mgmt), Claude Code (параллельные задачи) | есть низкоуровневый AgentsPanel + delegate; нет понятия «задача» со статусами/owner/stop-resume |
| 2 | Нет сквозного **dev/PR workflow** | Claude Code (issue→code→tests→PR) | есть режимы/tools/checkpoint/review, нет цельного flow задача→ветка→diff→проверки→commit |
| 3 | Artifact ≠ **доказательство** выполнения | Antigravity (plans/screenshots/recordings) | есть artifacts preview + terminal intelligence, но нет verification-артефакта (DoD) |
| 4 | **CLI parity 7.5/10** | Codex CLI | runPlainConversation проще runApiConversation: нет attachments-паритета, verify-hints, единого формата tool_results |
| 5 | Нет **crash-resume** длинных сессий | Codex cloud tasks | есть exitReason + journal; прогресс цикла в памяти процесса → теряется при краше |
| 6 | **Review V1** — плоский текст | code-review инструменты | ревью другим провайдером, но без findings по файлам/строкам, severity, «fix selected» |
| 7 | Коннекторы без **готовых сценариев** | — | 7 РФ-коннекторов, но нет workflow-шаблонов поверх них |

---

## 4. P0 Roadmap (2–4 недели)

**1. Multi-agent Manager V1** — командный центр задач (раздел 7).
**2. Verification Artifact** — доказательство выполнения / DoD (раздел 8).
**3. Dev Task Flow V1** — сквозной путь задача→ветка→diff→проверки→commit (раздел 9).

Порядок: сначала **Multi-agent Manager** (вводит `agent_runs` — фундамент для остального и для crash-resume), параллельно/следом **Verification Artifact** (независим, свой артефакт+таблица 17), затем **Dev Task Flow** (использует verification как блок «Проверки»).

## 5. P1 Roadmap (1–2 месяца)

**4. CLI parity** — единый `serializeHistory`, attachments/verify-hints паритет, общий `streamWithFallback`.
**5. Crash-resume** — дополняет `agent_runs` живым прогрессом, баннер «сессия прервана», **без авто-доигрывания деструктива**.
**6. Review V2** — структурированные findings (file/line/severity/category), «fix selected findings», finding→patch.

## 6. P2 Roadmap (потом)

**7. Business workflow templates** — поверх РФ-коннекторов (раздел про РФ-сценарии): «отчёт по клиенту», «лиды Битрикс24», «сверка 1С↔Sheets», «маркетинг-отчёт Я.Директ», «КП→DOCX→Я.Диск», «статус в Telegram». Каждый: входы / коннекторы / права / artifact / verification step. **Это единственный пункт, прямо монетизируемый для РФ-агентств — но требует решения «продукт vs внутренний инструмент».**
**8. Controlled memory UI** — управление core-memory/архивной памятью из UI.
**9. Policy dashboard** — единый экран контроля: траты по чатам/проектам, audit tail, последние writes, активные субагенты, denylist-правила.
**10. SDK/headless mode** — запуск агентного цикла без UI (для CI/автоматизации).

---

## 7. Архитектура: Multi-agent Manager V1

**Идея:** тонкий слой «задача» (`agent_runs`, keyed by существующий `run_id`) поверх уже готовых sub-sessions / sub-queue / agents IPC. Один `ai:send` = одна строка `agent_runs`. Субы/todos/файлы/артефакты/верификация уже связаны с прогоном (`parentChatId=chatId`, `run_id` в audit/plan_steps) — Manager их агрегирует и даёт lifecycle.

**Статусы:** `queued | running | waiting_review | done | failed | stopped`. `waiting_review` **вычисляется** (последний verify=fail ИЛИ незакрытая review-сессия), не выдумывается.
**Owner:** `main | review | delegate | background` (из SendOwner; delegate в V1 не создаёт top-level run — суб живёт внутри main-run; background = autonomous loop).
**Stop:** переиспользует существующий `ai:stop` (уже каскадит abort в субы + sub-queue.cancel). **Resume V1 = честный re-send** из `run_inputs.user_message` (не checkpoint-resume — тот в V2, см. CLAUDE.md п.5.4); в UI подпись «↻ Переотправить», не «продолжить».

### Data model (миграция 16, append)
```sql
CREATE TABLE IF NOT EXISTS agent_runs (
  run_id TEXT PRIMARY KEY,            -- существующий randomUUID из ai.ts
  project_path TEXT NOT NULL, chat_id INTEGER,
  owner TEXT NOT NULL DEFAULT 'main' CHECK(owner IN ('main','review','delegate','background')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('queued','running','waiting_review','done','failed','stopped')),
  provider_id TEXT, model TEXT, send_id INTEGER,
  agents_count INTEGER NOT NULL DEFAULT 0, tool_count INTEGER NOT NULL DEFAULT 0,
  files_count INTEGER NOT NULL DEFAULT 0, cost_cents INTEGER NOT NULL DEFAULT 0,
  error TEXT, started_at INTEGER NOT NULL, ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs(project_path, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(project_path, status);

CREATE TABLE IF NOT EXISTS agent_run_events (    -- Timeline задачи (append-only)
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL,
  kind TEXT NOT NULL,        -- user_msg|assistant_msg|tool_call|delegate|todo|file_write|artifact|verify|status|error
  label TEXT, detail TEXT, ref TEXT, status TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_events_run ON agent_run_events(run_id, id);
```
**Резерв под Crash-resume (P1):** колонки `turn_index`, `last_tool_name`, `last_checkpoint_id`, `agent_mode`, `updated_at` добавит миграция 19 (ALTER) — не дублировать таблицу. Переиспользуем без изменений: `chat_sessions(kind='subagent')`, `session_todos`, `audit_log(run_id)`, `run_inputs(run_id)`, `plan_steps`.

### IPC (handler→preload→api.d.ts)
- `agent-runs:list(projectPath,{status?,owner?,limit?})` → `AgentRun[]`
- `agent-runs:get(runId)` → `{run, events, subs, todos}` (агрегат: subs по `parentChatId=run.chatId`, todos по `sessionId=run.chatId`)
- `agent-runs:stop(runId)` → через существующий `ai:stop`, status→stopped
- `agent-runs:resume(runId)` → re-send из run_inputs
- Изменения (additive): `ai.ts` — create на старте/finish на done; `tool-handlers.ts` — **опциональный** `ctx.recordRunEvent?.(runId,kind,payload)` в существующих точках (emitActivity/diffConfirmWrite/delegate/artifact/verify); новые ai:event `run-started/run-finished/run-event` роутятся в Chat.tsx рядом с `subagent-run`.

### UI
Новая вкладка **«Задачи»** (ViewId `tasks-manager`), отдельно от «Агенты» (та остаётся low-level inspector субов): `AgentRunsPanel.tsx` — список задач (status-dot, title, owner-бейдж, provider·model, N субов, todos-прогресс, 🔧/📄/$/длительность, Stop/Resume), раскрытие → 4 секции (Timeline events / дерево субов через общий `lib/agent-tree.ts` / files touched с reveal / verification+artifacts).

### Файлы
Новые: `electron/storage/agent-runs.ts`, `electron/ipc/agent-runs.ts`, `src/components/AgentRunsPanel.tsx`, `src/lib/agent-tree.ts`, `tests/storage/agent-runs.test.ts`. Правим: `db.ts`(миграция16), `main.ts`, `ipc/ai.ts`, `ipc/tool-handlers.ts`(опц. recordRunEvent), `preload.ts`, `api.d.ts`, `projectStore.ts`(ViewId), `Chat.tsx`(роутинг), `AgentsPanel.tsx`(импорт agent-tree), `Sidebar.tsx`, `App.tsx`, `layout.css`, `CLAUDE.md`.

### Фазы
1. Данные (миграция16 + storage + тест, wiring в main без использования). 2. Запись задач (ai.ts create/finish + reconcile зависших running→failed на старте). 3. IPC + панель read-only (list/get + agent-tree вынос + AgentRunsPanel + вкладка). 4. Timeline + lifecycle (recordRunEvent + stop/resume + live-events).

---

## 8. Архитектура: Verification Artifact

**Идея:** третий kind артефакта (`html|docx|verification`), генерируемый собственным tool `attest_verification` в конце задачи. **Доктрина: «не верь модели — перепрогони».** Статус проверок ставит САМ хендлер по `exitCode`, не модель — это и отличает доказательство от отчёта.

**Поток:** агент зовёт `attest_verification({task_summary, changed_files[], checks[{command,status?}], risks[], ui_screenshot?})` → хендлер для каждого check с командой **перепрогоняет** через `ctx.tools.runCommand` (denylist+secret-scanner уже внутри), ставит `passed/failed` по exitCode; `changed_files` сверяет с реальным undo/recordWrite (флаги claimed/actual); screenshot из последнего `browser_screenshot`; `overall` = passed/failed/partial/not_run; пишет `{slug}.verification.json` + `.html` (рендер в стиле `wrapHtml`, бейджи из палитры charts.ts) → ai:event `artifact-created kind:'verification'` + `verification-attested`; `recordJournal('session',…)`.

### Data model
Файл (источник истины) `{project}/.verstak/artifacts/{date}/{slug}.verification.json` (схема `VerificationArtifact`: version/taskSummary/overall/changedFiles[{path,claimed,actual,lines}]/checks[{command,status,manual,exitCode,tail}]/screenshotPath/risks/runId/chatId) + `.html`. Лёгкая строка БД (миграция **17**): `verifications(id, project_path, chat_id, run_id, overall, checks_total, checks_passed, changed_files_count, artifact_path, html_path, task_summary, created_at)` + индексы — нужна для истории и для `verifications.latest(chatId)` в Review.

### IPC / UI
`verifications:list/latest/get`. ChatEvent: `artifact-created` kind += `verification` + variant `verification-attested`. UI: `ArtifactsPanel` — verification-pill с бейджем `DoD: N/M`; `ArtifactPreview` открывает `.verification.html`. **Explicit Review интеграция (главная фишка):** `composeReviewPayload` добавляет VERIFICATION-блок — ревьюер сверяет утверждения агента с доказательствами; в `ReviewPanel` бейдж DoD.

### Файлы
Новые: `electron/ai/verification.ts`(тип+renderVerificationHtml+computeOverall), `electron/storage/verifications.ts`, `electron/ipc/verifications.ts`, `tests/ai/verification.test.ts`. Правим: `db.ts`(17), `tools.ts`(TOOL_DEF), `tool-handlers.ts`(verifyAttestationHandler), `types.ts`, `artifacts.ts`(writeVerificationArtifact), `main.ts`, `preload.ts`, `api.d.ts`, `projectStore.ts`, `ArtifactsPanel.tsx`, `ArtifactPreview.tsx`, `Chat.tsx`, `compose-review-payload.ts`, `ReviewButton.tsx/ReviewPanel.tsx`, `layout.css`.

### Фазы
1. Ядро (verification.ts тип+рендер+computeOverall + writeVerificationArtifact + тесты, без БД/UI). 2. Tool end-to-end (attest_verification + хендлер с перепрогоном + pill + preview, как файл-артефакт без БД). 3. Персист (миграция17 + storage/ipc + insert). 4. Review DoD (latest в payload + бейдж).

---

## 9. Архитектура: Dev Task Flow V1

**Идея:** тонкий оркестратор `DevTask` поверх готовых undo/checkpoint, plans, preflight, verify, github-коннектора, readGitStatus. Один объект агрегирует ветку, run_id'ы, чекпоинт, проверки, итоговый пакет. **Не трогаем agent loop/system-layer — DevTask наблюдает существующие события.**

**State machine:** `draft → branching → in_progress → review_ready → (paused) → packaged → committed/cancelled`.
- draft: checkpoint снят (`undo:checkpoint`), `base_branch/base_sha` зафиксированы.
- branching: ветка `verstak/<slug>-<ts>` (`git checkout -b`) или dirty-in-place; опц. `git worktree` для Pre-flight Sandbox.
- in_progress: агент крутит обычный loop; writes уже в file_undo. **Human-in-the-Loop breakpoint** = пауза на pending-write (механизм `diffConfirmWrite` ждёт `ai:resolve-write` уже есть) → `paused` → пользователь правит руками → resume с свежим git-diff в контексте.
- review_ready: сборка diff (`git diff base..HEAD`) + проверки. **Pre-flight Sandbox Pipeline:** при `useWorktree` checks гоняются в фоновом worktree ДО показа диффа.
- packaged: пакет = changed files + checks summary + risks (из preflight) + **Conventional Commit Planner** (разбивка на микрокоммиты `type(scope): subject` — V1 эвристика по путям+affectedZones) + PR summary.
- committed: `git add+commit` по плану → опц. `github.create_pr`. **Авто-push не делаем — пользователь жмёт.**

### Data model (миграция 18)
`dev_tasks(id, project_path, chat_id, plan_id, title, state CHECK(...), base_branch, base_sha, work_branch, worktree_path, checkpoint_id, risk, summary, package_json, created_at, updated_at)` + `dev_task_runs(dev_task_id, run_id)` + `dev_task_checks(id, dev_task_id, label, command, status, exit_code, output_tail, ran_in_worktree, created_at)`. **changed_files НЕ дублируем — источник истины git diff**; package_json = замороженный снимок на момент packaged.

### IPC
- Новый `electron/ipc/git.ts` — **argv-форма** (не shell), top-frame guard, scanText, **denylist push/--force/reset --hard/clean -fd/--no-verify**: `git:status/diff/log/branchCreate/checkout/add/commit/worktreeAdd/worktreeRemove`. Имена веток `^[\w./-]+$`, paths через safeRealJoin.
- Новый `electron/ipc/dev-task.ts` — `devtask:open/openFromPreflight/get/list/linkRun/pause/resume/buildPackage/revert/commit/createPr`. `revert` = существующий `undo:revertToCheckpoint` (свой стек НЕ заводим). `buildPackage` гоняет verify:exec по checks.

### UI
Вкладка `task`: `DevTaskPanel.tsx` (4 секции: Изменения/Проверки/Риски/Пакет с редактируемым commitMessage), `DevTaskBadge.tsx` (индикатор в composer), `CommitPlanEditor.tsx`, `HitlBreakpointBar.tsx`. Чистая логика `electron/ai/commit-planner.ts` (diff+zones → CommitGroup[]) — покрыть тестами.

### Файлы
Новые: `ipc/git.ts`, `ipc/dev-task.ts`, `storage/dev-tasks.ts`, `ai/commit-planner.ts`, `DevTaskPanel/DevTaskBadge/CommitPlanEditor/HitlBreakpointBar.tsx`, `tests/ai/commit-planner.test.ts`, `tests/ipc/dev-task.test.ts`. Правим: `db.ts`(18), `main.ts`, `preload.ts`, `api.d.ts`, `projectStore.ts`(ViewId 'task'), `ipc/ai.ts`(linkRun одна строка), `App.tsx`. **Не трогаем:** system-layer, verify.ts, undo.ts, github.ts (переиспользуем).

### Фазы
1. БД+storage+git-READ. 2. open+наблюдение+откат (ценность доставлена до git-write). 3. git-write+ветки+commit. 4. проверки+commit-planner+пакет. 5. опции (worktree sandbox + HitL pause/resume + createPr).

---

## 10. P1 кратко (детали — у архитекторов)

**CLI parity:** вынести `serializeMsg` из `buildCliPrompt` в экспортируемый `serializeHistory(messages,opts)` (`electron/ai/history-serializer.ts`); `formatToolResult` учитывает `r.error` (сейчас игнорируется!) + `smartCompressResult` из compact-history; единый `describeAttachments(mode)`; `appendVerifyHint` для CLI; общий `streamWithFallback` (убрать дубль smart-fallback в обоих runner'ах). Без новых IPC.

**Crash-resume:** **дополняет** `agent_runs` (миграция 19 ALTER: `turn_index/last_tool_name/last_checkpoint_id/agent_mode/updated_at`); `agentRuns.tick()` на каждом turn; на старте app `findStale()` → `ai:list-resumable` → баннер. **КРИТИЧНО:** если `last_tool_name ∈ {write_file,apply_patch,run_command,ssh,connector-mutating}` ИЛИ mode∈{auto,bypass} — НЕ предлагать авто-возобновление, только «показать что было» + ручной ре-промпт. Деструктив никогда не доигрывается сам.

**Review V2:** `REVIEWER_SYSTEM_PROMPT` → строгий JSON-блок findings `{id,file,line,severity:P0-P3,category:bug|regression|security|missing-test|architecture|UX,title,detail,suggestedFix?}`; парсер `src/lib/review-findings.ts` (renderer-side, как compose-review-payload; fallback на старый regex); ReviewPanel — карточки по severity, чекбокс «принять», `file:line` reveal; «Fix selected findings» → таргетированный `ai.send`. БД-персист findings — V1.5.

---

## 11. Риски (сводно)

- **Дубль `agent_runs` (Manager↔Crash-resume)** → решено: одна таблица, Crash-resume только ALTER (миграция 19).
- **Конфликт миграций v16** → решено: последовательность 16/17/18/19.
- **«Resume» врёт про восстановление** → V1 = честный re-send, подпись «Переотправить»; checkpoint-resume в V2.
- **Модель врёт о проверках** → verification сам перепрогоняет команды по exitCode.
- **Две похожие панели (Agents↔Tasks)** → чёткое разделение: Agents = inspector субов, Tasks = high-level прогоны; `buildAgentTree` общий.
- **Git-write опасен** → один git.ts, argv-форма, denylist push/--force/reset, без --no-verify.
- **projectStore раздувание** (CLAUDE.md п.5) → dev_task/runs — отдельные срезы, логика в IPC/storage, не в store.
- **secret-leak в verification/checks tail** → переиспользуем scanText (после security-hardening).
- **sqlite NODE_MODULE_VERSION шум** (известные ~8) → следить, не путать с регрессией.

## 12. Критерии готовности (сводно)

Каждая фаза: `npm run type` чисто + `npm run test:fast` без новых падений сверх известного sqlite-шума + отдельный коммит/тег + откатывается. Pure-логика (computeOverall, commit-planner, serializeHistory, parseReviewFindings) — обязательно покрыта тестами (CLAUDE.md п.7). Контракты `system-layer.ts`/провайдеров/старых миграций НЕ изменены. Детальные DoD по фичам — в разделах 7–10.

## 13. Что отдать Codex первыми задачами

**Порядок (каждая самодостаточна, type+test между):**

1. **[Manager Фаза 1]** Миграция 16 (`agent_runs` + `agent_run_events`) + `storage/agent-runs.ts` (create/appendEvent/finish/incr/list/get/getEvents) + `tests/storage/agent-runs.test.ts`. Wiring в main.ts (создать, не использовать).
2. **[Общее]** Вынести `buildAgentTree`+`TreeNode` из `AgentsPanel.tsx` в `src/lib/agent-tree.ts`, переключить AgentsPanel на импорт. (Разблокирует Manager UI.)
3. **[Manager Фаза 2]** `ai.ts`: create на старте `ai:send` (owner из SendOwner) + finish на done/error/aborted + reconcile зависших running→failed на старте app.
4. **[Verification Фаза 1]** `electron/ai/verification.ts` (тип + computeOverall + renderVerificationHtml) + writeVerificationArtifact + `tests/ai/verification.test.ts`. (Независимо от Manager, чистая логика.)
5. **[Manager Фаза 3]** `ipc/agent-runs.ts` (list/get) + preload + api.d.ts + `AgentRunsPanel.tsx` (read-only) + вкладка «Задачи». **Первая видимая ценность.**
6. **[Verification Фаза 2]** `attest_verification` TOOL_DEF + verifyAttestationHandler (перепрогон команд) + pill/preview.
7. **[Dev Task Flow Фаза 1]** Миграция 18 + `storage/dev-tasks.ts` + `ipc/git.ts` (READ: status/diff/log).
8. **[CLI parity]** `history-serializer.ts` (вынос serializeMsg + formatToolResult с r.error + describeAttachments). Низкий риск, высокая отдача на консистентность.

Дальше — по фазам разделов 7–9 (lifecycle/Timeline, verification persist+review, dev-task git-write+package).

---

## Стратегическая рамка (навигатор)

ТЗ позиционирует это как «корпоративную AI-платформу». Честно: **эти инвестиции укрепляют именно защитимый клин Verstak** (контроль + проверяемость + оркестрация + РФ-интеграции), а не гонку «ещё одна IDE». P0/P1 — техническая мощь, которая делает агента видимым/управляемым/доказуемым; это полезно даже как **внутренний инструмент**. Прямую монетизацию даёт только P2 #7 (РФ workflow-шаблоны) — и он упирается в нерешённую развилку «продукт на продажу vs станок агентства» (см. ШТУРМ). Roadmap построен так, что каждая фаза приносит ценность **до** этого решения и исполняется инкрементально помощником/Codex без большого рефактора.
