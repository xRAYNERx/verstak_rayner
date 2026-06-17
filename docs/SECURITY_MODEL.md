# SECURITY_MODEL.md — модель безопасности Verstak

> Источник правды по защитным слоям. Обновлять при изменении любого из них.
> Последняя сверка: 2026-06-17 (после аудит-сессии 1.5.5–1.5.7).

Verstak — десктопный агент, исполняющий инструменты (чтение/запись файлов, команды,
сетевые коннекторы) от лица модели. Угрозы: утечка секретов в контекст/логи/коммит,
выход за пределы проекта, исполнение обфусцированных команд, неотменяемые действия,
порча данных, MITM. Ниже — слои, каждый со своим файлом-источником.

---

## 1. Файловый доступ — `electron/ai/path-policy.ts`

- **`safeRealJoin(projectRoot, rel)`** — единственный санкционированный способ собрать
  путь из пользовательского/модельного ввода. realpath-разворачивает компоненты →
  блокирует выход за корень через `..` и через **symlink** (ревью F4/F5).
- **`isWithinKnownRoots(target, roots)`** — realpath-aware (с textual fallback для
  несуществующих путей). Используется в `files:reveal`, `files:docx-to-html`, протоколе
  иконок. Раньше была чисто текстовой → symlink наружу обходил проверку (закрыто).
- **`files:tree` (`listTree`)** использует `lstat` и **пропускает symlink** — symlink-
  директория наружу не раскрывается рекурсивно.
- Renderer: `nodeIntegration:false` + `contextIsolation:true`. ESM-preload требует
  `sandbox:false` (known trade-off, компенсируется CSP в проде + contextIsolation).

## 2. Секреты и редакция — `electron/ai/secret-scanner.ts`

- **`scanText(text)`** редактирует секреты ДО попадания текста в контекст модели,
  transcript, UI, лог. Покрытие PATTERNS: AWS, GitHub/GitLab, OpenAI, Anthropic,
  Google AIza, Slack, Stripe, JWT, private-key-блоки, http-basic-auth, **+ RU/TG/Yandex**
  (VK `vk1.a`, Yandex OAuth `y0_`, Telegram bot-token, generic auth-keyword→value для
  DaData/Контур/GigaChat — ревью M1).
- Прогоняется через scanText: вывод `run_command` (stdout/stderr), `verify:exec`,
  MCP-вывод, **результаты и ошибки коннекторов** (ревью M2), git-error-сообщения.
- **`isForbiddenPath(rel)`** блокирует `.env`/`.env.*`, `*.key/.pem/.p12/.pfx/.crt`,
  `.ssh`/`.aws`/`.gnupg`/`.config/gcloud`, `credentials`, `cookies.json`,
  **`creds*.json`/`credentials*.json`** (ревью B1). Применяется в: write_file,
  gitAdd, importProjectIcon.

## 3. Команды — `electron/ai/command-policy.ts` + `mode-policy.ts`

- **`classifyCommand(cmd)`** — денилист деструктива/обфускации: fork-bomb, shutdown,
  `curl|sh`-вектор (включая `pwsh`), `base64 -d | sh`, `sudo rm`, разрушающий git,
  чтение ключей, **`powershell`/`pwsh -EncodedCommand`** (ревью M13), `cmd /c` с
  раскрытием переменных.
- **`decide(tool, mode)`** (`mode-policy.ts`) — 5 режимов: `ask`/`accept-edits`/`plan`/
  `auto`/`bypass`. `plan` блокирует write/command; `ask` требует подтверждения;
  `auto`/`bypass` авто-принимают. Подтверждения **слушают abort** (ревью B2) — Stop/
  таймаут/отмена роя разрывают ожидание, не виснут.

## 4. Скиллы — `tools_allow` (ревью M4)

- `tools_allow` из frontmatter скилла **реально применяется** в agent-loop:
  `selectAllowedToolDefs(TOOL_DEFS, mcp, toolsAllow)` фильтрует доступные модели
  инструменты. Read-only скилл физически не получает write_file/run_command.
  Fail-open только если ВСЕ имена — опечатки (broken-скилл ≠ дыра).

## 5. Коннекторы — `electron/connectors/`

- Все 31 коннектор **read-only**, свой код поверх официальных API. **Bitrix24**
  read-only гарантирован гейтом write-глаголов в единственном chokepoint `callMethod`
  (ревью B5).
- **Таймаут 30с** на каждом запросе: `connectorQueryHandler` комбинирует `ctx.signal`
  (ручной Stop / отмена роя) с таймером (ревью B4). Зависший хост не вешает агента.
- Креды — только из зашифрованного settings-store (safeStorage), не хардкод.
- **GigaChat TLS** (ревью M3): по умолчанию `rejectUnauthorized:false` (Sber CA не в
  Node trust store) с предупреждением в логе; настройка `gigachat_tls_verify` включает
  проверку для тех, кто поставил Russian Trusted Root CA.

## 6. Git-запись — `electron/ipc/git.ts`

- **`assertGitAllowed(argv)`** — денилист: push/force/--no-verify/--amend/reset --hard/
  clean/rebase/fetch/pull/filter-branch/`-a`/`--all`/`-am` (ревью B1).
- **`gitAdd`** прогоняет каждый path через `isForbiddenPath` → секреты не уезжают в
  коммит и при push в публичный PR.
- **DoD-гейт** (`devtask:commit`, ревью F2): коммит блокируется при fail/pending/running
  проверках. Режим — настройка `dod_mode`: `warn` (дефолт — обход через
  `overrideReason` → запись в `audit_log`), `block` (Mandatory DoD — обход
  запрещён), `off` (без гейта).

## 7. Иконки проектов — `electron/storage/project-icons.ts`

- **`isInsideProjectIcons(p)`** realpath-aware (ревью F6) — symlink внутри папки иконок
  наружу не считается «внутри» → нет чтения произвольного файла через `gg-project-icon://`.
- **`importProjectIcon`** валидирует расширение (только изображения) + `isForbiddenPath`
  ДО чтения (ревью F7) — нельзя скопировать произвольный/секретный файл как `.png`.

## 8. Crash-resume — `electron/storage/agent-runs.ts`

- **`isAutoResumable(run)`** НИКОГДА не авто-доигрывает деструктив после краша:
  CLI-провайдеры → всегда `false` (их инструменты невидимы main-процессу); мутирующие
  tools и unsafe-режимы (auto/bypass) → `false`. Регресс-тест на все CLI-id.

## 9. Изоляция процессов

- `single-instance lock` (`requestSingleInstanceLock`) — вторая копия не прогоняет
  `reconcileStale()` против той же БД (иначе пометила бы живые прогоны первой как failed).
- Чистое завершение (`app-lifecycle.ts`): на закрытии гасятся PTY/MCP/AI-стримы.

## 10. Что НЕ закрыто (known limitations)

- CLI-провайдеры: инструменты/проверка/таймлайн/crash-guard работают ВНУТРИ бинаря и
  не видны Verstak — честно помечено «урезанный контроль» (см. `PROVIDER_CAPABILITIES.md`).
- `generic HTTP` SSRF: блокирует только 3 metadata-IP, нет loopback/private-диапазонов
  (ограничено allow-list из Settings, риск низкий).
- GigaChat TLS по умолчанию без проверки CA (см. §5) — opt-in через настройку.
- Полный бандл Russian Trusted Root CA в resources — отдельная задача после живого теста.

---

Связано: `PROVIDER_CAPABILITIES.md` (что какой провайдер умеет под контролем Verstak),
`CLAUDE.md` §8 (правила безопасности проекта).
