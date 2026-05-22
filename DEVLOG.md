# DEVLOG — журнал разработки GeminiGrok

Хронологический лог значимых изменений. Свежие сверху. Пишем когда:
- Закрыт крупный feature / refactor.
- Найден и пофикшен класс багов.
- Принято архитектурное решение.

---

## 2026-05-22 — ночной рефактор V3

**Контекст:** Pavel ушёл спать, дал задание «доведи до версии 3.0». Версия 3.0 за ночь невозможна, но сделан фундамент для будущих мультиагент-фич и заметный скачок надёжности.

### Phase A — SendRegistry (`5576683`)

**Проблема:** Было 2 параллельных мапа для роутинга `ai:event` (`sendIdToChatId` + `sendIdToReviewChatId`). За 24ч до этого пришлось чинить 3 race-бага в Review V1, все вокруг этих мапов. Каждый новый тип агента требовал бы ещё одного мапа + новых race семейств.

**Решение:** Один типизированный `sendOwners: Record<number, SendOwner>`. SendOwner — discriminated union `{ kind: 'chat'; chatId } | { kind: 'review'; reviewChatId; parentChatId }`. API: `registerSendOwner / lookupSendOwner / forgetSendOwner`.

**Что в коде:** `src/store/projectStore.ts`. Routing в Chat.tsx упрощён, добавлен `forgetSendOwner` на done/error event'ах (раньше мапы протекали).

**Будущая мультиагентность** = расширение SendOwner union, без новой инфраструктуры.

### Phase B — Resilience (`7b01716`)

**B1: Context Sliding Window** (`electron/ai/compact-history.ts`)

История tool_results раздувала input quadratically на длинных сессиях (10+ turns с read_file по 50KB). Решение: `compactToolHistory(messages, currentTurn)` возвращает компактную копию для отправки провайдеру:
- Последние 3 turn'а целиком, но cap 12KB на tool result (tail-truncate).
- Старше 3 — заменяются маркером `[compacted: read_file (45KB, turn 5) — обрезано sliding window]`.
- Tool calls (имя+args) сохраняются — нужны для continuity.
- Оригинал не модифицируется.

Тесты: 6 случаев в `tests/ai/compact-history.test.ts`.

**B2: Exponential Backoff** (`electron/ai/with-retry.ts`)

Один транзиентный 429/503/ECONNRESET убивал 30-turn сессию. Решение: `withInitialRetry(factory)` — retry ТОЛЬКО на initial connection failure (до первого yield):
- max 4 попытки, full jitter (Amazon recipe: wait ∈ [0, base * 2^attempt]).
- `isRetriableError`: HTTP 408/429/5xx, node net codes, undici fetch cause unwrap, textual fallback.
- НЕ retry mid-stream (избежали бы дублирования текста).
- AbortSignal honored.
- onRetry callback эмитит tool-blocked event «Транзиентная ошибка, повтор через Xs».

Применён в `runApiConversation` per-turn. Тесты: 14 случаев классификации + retry семантики.

### Phase C — Cost Controller (`9c8772f`)

`gg-usage-pill` теперь окрашивается жёлтым >$2, красным >$5. Tooltip развёрнут: вместо `input: N, output: M` — полный breakdown с формулами `↑ 1.2M × $3/M = $3.60`.

`costSeverity(cents)` + `costBreakdown(...)` в `src/lib/pricing.ts`. Тесты: 12.

### Bonus (`d545c19`)

Закрыл 2 sendOwner-leak'а в моём же Phase A:
1. Background-project path не вызывал `forgetSendOwner` на done/error → leak при переключении проектов.
2. Manual `ai.stop()` не делал cleanup — done event иногда теряется при abort-mid-connect.

### Итоги ночи

| Метрика | До | После |
|---|---|---|
| Тестов проходит | 81 | 113 (+32) |
| Race-багов вокруг sendId | 3 за 24ч | 0 (закрыт класс) |
| Context window protection | нет | sliding window 12KB cap |
| Retry на 429/503 | нет | до 4 попыток с jitter |
| Cost visibility | tooltip с N токенов | цветовой pill + breakdown с ценой за модель |

Тэги для отката: `pre-night-refactor`, `phase-a-done`, `phase-b-done`, `phase-c-done`.

---

## 2026-05-21 (вечер) — Project Settings параллельный поток (`cc63e99`)

**Контекст:** В другой сессии Claude сделал ProjectSettings панель (шестерёнка вместо красного крестика в Project Rail). 2 вещи были broken:

1. `revealInExplorer` метод не существовал в API → TS не падал благодаря optional chaining `?.()`, но кнопка ↗ молчала. Подключил `files:reveal` IPC через `electron.shell.openPath`.

2. Системный промпт проекта сохранялся в `settings.system_prompt_${path}`, но НИКТО его не читал. Пользователь жал «Сохранить», видел галочку, промпт никогда не доходил до модели. Подключил через `PrepareSystemInput.projectSystemPrompt` → `prepareParts` дописывает к userLayer.content. Прокинуто для обоих путей: API (через `prepareSystemContext`) и CLI (через `createProvider` → все 4 CLI-адаптера → `buildCliPrompt`). При review (useReviewerPrompt) НЕ подмешивается — ревьюер в изоляции.

---

## 2026-05-21 (вечер) — Explicit Review V1 (`066d683` → `9af0e5f`)

**Что:** Кнопка `🔍 Ревью + ▾` в composer-toolbar. Клик → создаётся sub-chat (kind='review') с REVIEWER_SYSTEM_PROMPT, через провайдера ≠ основного. Результат — pill в Timeline `🔍 {Provider}: N замечаний`. Клик по pill → раскрывающаяся панель с Markdown. Кнопка «↪ Учесть» отправляет в основной чат с префиксом `[Review from {provider}]:`.

**Архитектурно:**
- Schema v2: `chat_sessions.kind` ('main'|'review') + `parent_chat_id`.
- Review sub-chats скрыты из Sidebar (фильтр `kind='main'`).
- `ai:send` принимает overrides: `providerId / model / noTools / useReviewerPrompt`.
- Cascade-delete review sub-chats при удалении main-чата.

**После V1 пришлось пофиксить 5 реальных багов из аудита Grok (`f4e16e1`):**
1. openedReviewId переживал смену чата → панель чужого ревью.
2. Race в refreshReviewsFor при быстром переключении.
3. Forward во время streaming → конфликт с активным стримом, теперь disabled.
4. sendId=0 (провайдер недоступен) → pill висел в streaming навсегда.
5. Удаление main-чата не чистило in-memory review state.

Bonus fix: ReviewButton проверяет наличие API-ключа для default reviewer'а перед запуском.

---

## 2026-05-21 (день) — UX штурм V1 (`1ec7d5e`)

Сделано за один заход на основе brainstorm с Pavel:

1. **Tool Execution Timeline** — горизонтальная лента активности между чатом и композером. Pulse работы агента (📖 read / 📂 list / ✏ write / ⚡ command / 🚫 blocked).
2. **Session Checkpoint** — кнопка 📍 в композере. Запоминает вершину undo-стека, потом одним кликом откатывает все файловые правки сессии. IPC: `undo:checkpoint` + `undo:revertToCheckpoint`.
3. **Visual Read Markers** в Sidebar — ● (правил, фиолетовый) / ○ (читал, синий) / · (листал, серый) рядом с файлами + подсветка имени.
4. **Mode Discovery hint** в empty state — карточка с 5 режимами (1-5), Shift+Esc, упоминание чекпоинта.

**Параллельно сделана Phase 2 CLI-аудита Grok:**
- `electron/ai/child-kill.ts` — `treeKill` через `taskkill /F /T` на Windows. На все 4 CLI.
- `claude-cli` + `codex-cli`: парсинг usage (input/output/cached tokens).

---

## 2026-05-21 (день) — CLI parity Phase 1 (`f040628`)

Аудит cli-prompt.ts по 6 вопросам, исправлены 3 высокоприоритетные дыры:

1. **Tool results были слепы при API→CLI** — раньше `[tool calls: read_file]` (только имена). Теперь включают args (300 chars) и body (1500 chars). CLI знает что агент уже читал.
2. **slice(-10) count-based** → token-budget walk (40KB, MIN_TURNS=4). На длинных сессиях не теряется ход N-11.
3. **Дедуп user_layer** для CLI с нативным чтением: Claude Code сам читает CLAUDE.md, Codex — AGENTS.md, Gemini CLI — GEMINI.md. Не отправляем второй копией.

---

## 2026-05-21 (утро) — 5 режимов агента + autonomous loop (`d3c843a`, `52fe2d6`)

5 режимов как в Claude Code: `ask` / `accept-edits` / `plan` / `auto` / `bypass`. Цветовая шкала по безопасности (зелёный→красный). Горячие 1-5. `ModePicker.tsx`, mode-policy.ts с `decide(toolName, mode)`.

Фоновый autonomous improvement loop — «ночной режим» когда юзер спит, читает journal проекта + предлагает 3 улучшения.

---

## 2026-05-21 (утро) — schema_version миграции (`2fdbcc9`)

`MIGRATIONS` массив с tracking через `schema_version` table. Раньше ALTER/SCAN на каждый старт. Теперь миграции только при version bump. Сейчас 2 миграции: chats.session_id (v1), chat_sessions.kind + parent_chat_id (v2).

---

## 2026-05-21 (раннее) — multi-chat streaming preservation (`7ce9b65`)

Переключение между чатами одного проекта раньше убивало in-flight стрим. Решение: `chatSnapshots: Record<chatId, SessionSnapshot>` + `applyEventToChat` для роутинга событий «фоновых» чатов в снапшоты. `switchChatSession` больше не вызывает `ai.stop`.

---

## 2026-05-21 (раннее) — read_journal tool + persistent activity (`25dd395`, `704cff9`)

AI получает self-awareness loop: тулза `read_journal` читает последние N записей dev-журнала проекта (что сам недавно делал). Полезно для «продолжи вчерашнее».

Persistent activity log: все read/list/search/connector события идут в Journal, не только write/command. Audit trail для трекинга что AI делал.

---

## Хронологически раньше — фундамент

Сжато (полная история в git log):

- **Multi-provider:** 8 провайдеров (Gemini API/CLI, Claude API/CLI, Grok API/CLI, OpenAI, Codex CLI) с per-chat выбором.
- **Voice input:** Web Speech API через VoiceInput компонент.
- **DiffView confirmation:** все write_file через явное подтверждение пользователя.
- **Built-in terminal:** node-pty xterm, run_command tool с denylist.
- **Connectors:** OData 1С + generic HTTP, registry для расширения.
- **Path policy:** safeRealJoin против symlink escape.
- **Secret scanner:** redact API keys/tokens в logs.
- **Plans + Tasks + Feedback** вкладки.

---

## Что в работе / на очереди

1. **Российские коннекторы** — приоритет на 22-23.05. План:
   - Bitrix24 (REST + OAuth)
   - Yandex Tracker (задачи, очереди)
   - YandexGPT / GigaChat как AI-провайдеры
   - AmoCRM (опционально)

2. **Store рефактор Phase 2** — выделить `ChatSessionLifecycle` (enterChat/leaveChat) и `PerChatState` (map chatId → bundle). Подготовка к мультиагент-фичам.

3. **Мультиагент V1** — `delegate_task` tool (одна модель зовёт другую), debate mode (две модели обсуждают патч).

4. **Cumulative cost** per project с warning порогом.

5. **Тесты** интеграционные для IPC handlers, agent loop, review flow.

---

Этот файл обновляется по факту крупных изменений. Если что-то сделано и важно для будущих сессий — допиши сюда сверху.
