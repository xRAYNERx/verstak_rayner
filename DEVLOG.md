# DEVLOG — журнал разработки GeminiGrok

Хронологический лог значимых изменений. Свежие сверху. Пишем когда:
- Закрыт крупный feature / refactor.
- Найден и пофикшен класс багов.
- Принято архитектурное решение.

---

## 2026-05-23 — V3 Implementation Marathon Part 2

После первого марафона (16+ коммитов V3 базы) — продолжение со стороны Claude.

### Skill enrichment
- **Авто-импорт скиллов из `~/.claude/skills/`** — loader теперь смотрит и в
  Claude Code папку, не только в `~/.geminigrok/skills/`. Pavel'я 8 BOS-скиллов
  появляются автоматически без копирования.
- **Context loaders реализованы.** Frontmatter `context_loaders: [{impl, runs_on}]`
  раньше парсился но не вызывался. Теперь — registry с 3 базовыми импл:
  - `load_client_card` — читает `agent-client-{slug}.md` по аргументу slash
  - `load_clients_list` — все клиенты агентства из ~/.claude/agents/
  - `load_today_brief` — дата + день недели для morning brief скиллов
  При первом user-message чата (или slash с аргументом) loaders запускаются
  и markdown инжектится в начало текста перед отправкой агенту.

### Artifacts UX upgrade
- **Embedded HTML preview** — клик на artifact pill открывает модал с iframe
  внутри окна. Раньше → external браузер. Кнопка ↗ в модале для open external.
- **DOCX preview через mammoth.js** — DOCX тоже теперь рендерится inline
  (конвертация в HTML на стороне main process). Mammoth warnings показываются
  жёлтым банером — для финального вида клиенту использовать «↗ Открыть внешне».
- **render_chart tool** — SVG charts (bar/line/pie) без npm deps. Сохраняется
  как .svg в artifacts dir, можно встраивать в HTML через `<img>`. Палитра GG,
  auto-format больших чисел (2.5M), XML escape.

### Multi-user UX
- **Profile management UI в Settings → 👤 Профили.** Таблица всех профилей,
  активация, удаление, форма создания. Раньше профили создавались только
  через Onboarding wizard, нельзя было переключиться или удалить.

### Bug fixes
- **Skill provider не override'ит совместимый выбор.** Built-in скиллы
  больше не имеют жёсткий `default_provider: claude` — наследуют выбор
  пользователя. Family-check: claude / claude-cli = одно семейство, не
  переключаем. То же для gemini, grok, openai/codex.
- **Понятная ошибка для headless+Max ограничения.** Claude Code v2.1.138
  в `--print` режиме НЕ использует Max OAuth — это известное ограничение
  Anthropic. Раньше пользователь видел `401 Invalid credentials`. Теперь
  чёткое сообщение с 3 вариантами решения, главное —
  `claude setup-token` (long-lived token tied to subscription).

### Тесты
- bitrix24: 5 cases (no-webhook, denylist, allow-prefix, unknown-op, info)
- telegram: 5 cases (no-token, bad-args, whitelist, dev fallthrough, info)
- charts: 6 cases (bar/line/pie render, escape, format)
- loaders: 6 cases (registry, today_brief, client_card)
- artifacts: 5 cases (HTML escape, DOCX zip signature, tmpdir cleanup)

**Итого тестов:** 160 passing (+22 за part 2, было 138). 8 sqlite-failures
неизменно (NODE_MODULE_VERSION mismatch).

### Файлы за марафон V3 part 2
- `electron/ai/skills/loaders.ts` — реестр + 3 базовых loader
- `electron/ai/charts.ts` — SVG renderer (~250 строк)
- `src/components/ArtifactPreview.tsx` — модал с iframe preview
- `src/components/ProfilesTab.tsx` — Settings вкладка профилей
- ipc/files.ts — files:docx-to-html через mammoth

---

## 2026-05-22 (ночь→утро) — V3 Implementation Marathon

**Контекст:** Pavel дал goal `C:\Users\Pavel\Downloads\GeminiGrok-V3-Plan.html`
с инструкцией «делай до полной реализации со своей стороны». Решения зафиксированы
в плане v1.1 раздел 14. Реализовано всё что не требует внешних credentials или
действий на стороне Pavel.

### Skills layer

- **electron/ai/skills/**: types, frontmatter parser, loader (server API + ~/.geminigrok/
  skills/ + built-in fallback), registry с refresh.
- 3 built-in скилла: bos-sales, bos-mkt, client-cycle (портированы из ~/.claude/skills/).
- IPC: skills:list / get / refresh / status.
- UI: SkillPicker (🎭 кнопка в composer-toolbar) + popup с группировкой по
  источнику. SlashCommandPopup при наборе «/» — автокомплит скиллов + системные
  /new и /clear.
- При активном скилле ai.send уходит через sendWithOverrides с system prompt +
  default_provider/model из frontmatter.
- 9 тестов на frontmatter parser.

### Connectors V3 (5 новых)

- **gsheets** — Google Sheets через service account JWT (RS256, без npm deps),
  ops: read_sheet / read_as_records / get_row / append_row(s) / update_cell /
  update_row. Access token кешируется на 50 мин.
- **ssh** — системный ssh клиент (без npm ssh2), ops: run_remote /
  run_python_script. Hard denylist опасных команд (rm -rf /var, /etc и т.п.),
  whitelist hosts. 11 тестов на denylist.
- **telegram** — Bot API через fetch, ops: send_message (с поддержкой
  message_thread_id для топиков) / edit / send_document (URL only V1) / react /
  delete / get_me. Rate limit 20 send/min на chat_id, whitelist chat_ids,
  secret-scanner на исходящий текст.
- **bitrix24** — Incoming webhook, ops: list_deals / get_deal / add_deal /
  update_deal / add_activity / list_leads / get_source_report / raw call с
  whitelist prefixes (crm.*, tasks.*, user.*) и denylist .delete методов.
- **yandex_direct** — OAuth + Reports API, ops: list_campaigns / list_ads /
  get_campaign_stats / get_keywords_stats / get_account_stats. Reports
  async → sync polling до 30 сек, fallback к processing: true.

### Artifacts

- npm i docx (--legacy-peer-deps).
- electron/ai/artifacts.ts: generateHtml (auto-wrap с базовым CSS) и generateDocx
  (Title + Heading 1-3 + параграфы + bullets). Сохраняются в
  `.geminigrok/artifacts/YYYY-MM-DD/`.
- Tools: generate_html, generate_docx в TOOL_DEFS.
- Handlers с emit нового ChatEvent `artifact-created`.
- UI: ArtifactsPanel рендерит pills 📄 в Timeline. Клик → открытие в дефолтном
  приложении через electron.shell.openPath (HTML→браузер, DOCX→Word).
- 5 тестов: sanitize filename, HTML escape, DOCX zip signature, tmpdir cleanup.

### Multi-user

- Schema v3 migration: user_profiles таблица (name, role, default_provider,
  default_model, skills_enabled JSON, is_active с unique partial index).
- electron/storage/user-profiles.ts + IPC.
- OnboardingWizard.tsx: 3 шага (имя+роль / API key / summary). 6 пресетов ролей
  с default provider/model/skills.
- App.tsx показывает wizard при первом запуске (settings.onboarding_completed
  пусто).

### Multi-agent

- delegate_task tool: основной агент делегирует подзадачу sub-agent с
  опциональным skill_id, provider_id, model. Sub-agent работает БЕЗ tools
  (нет каскадов). Result возвращается обёрнутым `[Delegate from X]`.
- skillRegistry прокинут через AiDeps → runApiConversation → ToolContext.
- Логируется в journal kind='note' с обрезанным запросом и ответом.

### Settings UI

- 6 новых секций в вкладке «Коннекторы»: Google Sheets (textarea JSON),
  Telegram (bot token + whitelist), SSH (host + key_path), Битрикс24 (webhook),
  Я.Директ (token + Client-Login), Skills server (base URL).
- Каждая с hint текстом: где взять credentials, что коннектор умеет.

### Quick actions

- Chat empty state: добавлены /bos-sales, /bos-mkt, /client-cycle quick-action
  кнопки. Старые (улучшения / аудит / карта) сохранены.

### Метрики

- 16 новых файлов, 2900+ строк кода + ~700 строк HTML/CSS.
- Тесты: 138 passing (+25 за V3). 8 sqlite-failures неизменны (нерелевантно).
- `npm run build` — успешно.

### Что осталось до production (требует действий Pavel)

1. Создать Telegram bot через @BotFather → копировать token в Settings.
2. Создать linux-user gemini-agent на 178.62.230.241, сгенерировать SSH ключ,
   whitelist sudo на /opt/los/*.py скрипты → внести host + key path в Settings.
3. Добавить `GET /api/skills` эндпоинт на aioperatingsystem.ru (FastAPI,
   переиспользует skill_context.py) → внести URL в Settings.
4. Сохранить service account JSON из /opt/los/creds.json в Settings (Google Sheets).
5. Pilot тест с Кристиной: /bos-sales → end-to-end закрытие overdue HH-лида.

### Тэги для отката

```
git log --oneline pre-night-refactor..HEAD
```

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
