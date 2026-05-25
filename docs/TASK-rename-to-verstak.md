# TASK: Переименование проекта verstak → verstak

**Дата выдачи**: 2026-05-26
**Тип**: rebrand (имя + логотип + appId + иконки)
**Исполнитель**: Codex / Claude Code / Игорь / любой dev
**Оценка**: 2-3 часа аккуратной работы + сборка

---

## 0. КОНТЕКСТ

Продукт **переименовывается** с рабочего имени `Verstak` (от 3 моделей) на финальное **`Verstak`** (русский «верстак» — рабочее место мастера). Новое имя отражает суть: open IDE для любых AI-моделей, vendor-agnostic, РФ-first.

Бренд-брифинг с палитрой, шрифтами, USP — `C:\Users\Pavel\Downloads\verstak_brand_brief_2026-05-25.html`.
Готовый лендинг — `C:\Users\Pavel\verstak\landings\verstak\`.
Готовый логотип (PNG в наборе размеров + SVG) — `C:\Users\Pavel\verstak\landings\verstak\assets\`.

---

## 1. КАРТА ЗАМЕН (текстовые)

Все замены делать **во всех файлах** проекта (исключения — `node_modules/`, `.git/`, `out/`, `release/`, `package-lock.json`, бинарники).

| Найти | Заменить на |
|---|---|
| `verstak` (lowercase) | `verstak` |
| `Verstak` (CamelCase) | `Verstak` |
| `VERSTAK` (UPPER) | `VERSTAK` |
| `verstak` (kebab) | `verstak` |
| `Verstak` (с пробелом) | `Verstak` |
| `verstak` (snake) | `verstak` |
| `ru.verstak.ide` | `ru.verstak.ide` |
| `.verstak` (папка-конфиг) | `.verstak` |

**ВАЖНО**: после массовых замен пройти глазами по diff — могут быть ложные срабатывания в комментариях / тестах / mockах где упоминается провайдер «Gemini» (это другое, его НЕ трогаем). Конкретно «Gemini» (без «Grok» рядом) — оставляем как есть, это название модели Google.

### Файлы где есть `verstak` (29 шт):

```
design-prototypes/redesign-v2.html
src/components/Settings.tsx
src/components/OnboardingWizard.tsx
src/components/BrowserView.tsx
package.json
package-lock.json   ← регенерируется npm install, можно не править руками
electron/main.ts
electron/ipc/tool-handlers.ts
electron/ipc/files.ts
electron/ai/tools.ts
electron/ai/skills/loader.ts
electron/ai/skills/types.ts
electron/ai/artifacts.ts
electron/ai/project-map.ts
electron/ai/system-layer.ts
electron/ai/user-layer.ts
tests/ai/artifacts.test.ts
tests/ai/cross-project.test.ts
tests/ai/cli-prompt.test.ts
tests/agent-bench/bench.test.ts
tests/agent-bench/README.md
scripts/launch.bat
docs/dev-journal.md
docs/superpowers/plans/2026-05-19-verstak-mvp.md
docs/superpowers/specs/2026-05-19-verstak-design.md
.gitignore
CLAUDE.md
DEVLOG.md
README.md
```

### Файлы где есть `Verstak` (27 шт):

Пересекаются с предыдущим списком + дополнительно:
```
design-prototypes/chat-layout-v1.html
src/components/Chat.tsx
src/components/ProjectRail.tsx
src/components/ProjectSettings.tsx
src/components/ProfilesTab.tsx
electron/ai/claude-cli.ts
.verstak/RULES.md
index.html
docs/superpowers/specs/2026-05-23-verstak-v3-vision.md
```

---

## 2. КОНКРЕТНЫЕ ИЗМЕНЕНИЯ В `package.json`

```diff
- "name": "verstak",
+ "name": "verstak",

- "description": "Desktop AI coding agent: 8 providers (API + CLI subscriptions), tools, journal, connectors",
+ "description": "Verstak — desktop AI coding IDE, vendor-agnostic, with Russian models. Многомодельный IDE для разработчиков.",

  "build": {
-   "appId": "ru.verstak.ide",
+   "appId": "ru.verstak.ide",
-   "productName": "Verstak",
+   "productName": "Verstak",
    "copyright": "Copyright © 2026 Pavel Frolov",
    ...
    "nsis": {
      ...
-     "shortcutName": "Verstak",
+     "shortcutName": "Verstak",
-     "artifactName": "Verstak-Setup-${version}-${arch}.${ext}"
+     "artifactName": "Verstak-Setup-${version}-${arch}.${ext}"
    },
    "portable": {
-     "artifactName": "Verstak-Portable-${version}-${arch}.${ext}"
+     "artifactName": "Verstak-Portable-${version}-${arch}.${ext}"
    }
  }
```

---

## 3. ИКОНКИ ПРИЛОЖЕНИЯ

**Что заменить**:
- `resources/icon.ico` (Windows)
- `resources/icon.png` (macOS / Linux)

**Источник** (уже готов):
- `landings/verstak/assets/logo.png` — 2048×2048 PNG (оригинал Higgsfield)
- `landings/verstak/assets/logo-512.png` — 512×512 PNG (если нужно меньше)

**Шаги**:

1. **icon.png** (для macOS/Linux):
   - Скопировать `landings/verstak/assets/logo.png` в `resources/icon.png` (заменить)
   - Минимальный размер для Electron: 512×512. Текущий 2048×2048 — норм, можно уменьшить до 512×512 через Sharp/Pillow если хочется лёгкости

2. **icon.ico** (для Windows):
   - В `package.json` уже подключена зависимость `png-to-ico`. Сгенерировать:
   ```bash
   npx png-to-ico landings/verstak/assets/logo.png > resources/icon.ico
   ```
   - Или собрать .ico из нескольких размеров через `png-to-ico` (рекомендуется 16/32/48/64/128/256):
   ```bash
   npx png-to-ico --sizes 16,32,48,64,128,256 landings/verstak/assets/logo.png > resources/icon.ico
   ```

**Проверка**: после `npm run dist:win` иконка приложения в `release/Verstak-Setup-*.exe` должна быть новая, проверь в File Explorer.

---

## 4. ПЕРЕИМЕНОВАНИЕ ПАПКИ КОРНЯ ПРОЕКТА

**Текущая**: `C:\Users\Pavel\verstak\`
**Новая**: `C:\Users\Pavel\verstak\`

**Это breaking change**. Может потянуть за собой:
- Хуки Claude Code (если завязаны на абсолютный путь)
- Скрипты в `scripts/launch.bat`
- Деплой-настройки CI (если есть)
- Закладки в редакторах

**Делать порядком**:
1. Закоммитить весь текущий стейт в git: `git commit -am "rebrand: pre-rename checkpoint"`
2. Закрыть VS Code / Cursor / любой редактор открытый на проекте
3. Переименовать папку:
   ```bash
   mv C:/Users/Pavel/verstak C:/Users/Pavel/verstak
   ```
4. Открыть новую папку в редакторе
5. Проверить что `npm run dev` работает (на всякий случай: `npm install --legacy-peer-deps` сначала, потом `npm run electron-rebuild`)
6. Поискать абсолютные пути `C:\Users\Pavel\verstak` в коде/конфигах — если есть, заменить:
   ```bash
   grep -r "C:\\\\Users\\\\Pavel\\\\verstak" . --include="*.ts" --include="*.js" --include="*.json"
   grep -r "C:/Users/Pavel/verstak" . --include="*.ts" --include="*.js" --include="*.json"
   ```

**Альтернатива (мягче)**: оставить папку как есть, поменять только содержимое. Минус — внутреннее имя папки не совпадает с продуктом, путаница в будущем.

**Рекомендация**: переименовать сразу, MVP-стадия идеальна для этого.

---

## 5. ПЕРЕИМЕНОВАНИЕ СКРЫТОЙ ПАПКИ `.verstak` → `.verstak`

Эта папка создаётся в **корне каждого открытого пользователем проекта** (видна по коду в `electron/ai/skills/loader.ts` и `system-layer.ts`). В ней лежит `RULES.md` — правила агента для конкретного проекта.

**Шаги**:
1. Переименовать **внутреннюю** папку проекта `C:\Users\Pavel\verstak\.verstak\` → `.verstak\`
2. Найти в коде все упоминания строки `.verstak` и заменить на `.verstak`:
   - `electron/ai/skills/loader.ts`
   - `electron/ai/skills/types.ts`
   - `electron/ai/system-layer.ts`
   - возможно `electron/ai/user-layer.ts`
3. **Миграция для существующих юзеров**: пока продукт не выпущен в публику — миграция не нужна. Если уже есть пара тестовых установок, можно добавить fallback: при старте проекта, если есть `.verstak/` но нет `.verstak/` — переименовать.

---

## 6. ОНБОРДИНГ / UI КОПИРАЙТ

Поискать и обновить **тексты в UI**, где могут быть упоминания Verstak:

- `src/components/OnboardingWizard.tsx` — приветственное окно при первом запуске («Welcome to Verstak» → «Welcome to Verstak»)
- `src/components/Settings.tsx` — окно настроек (заголовок, about-секция)
- `index.html` — `<title>`, возможно meta
- `electron/main.ts` — `BrowserWindow.title`, menu items
- `electron/ai/claude-cli.ts` — system prompts могут содержать имя

**Запустить grep на каждом** — увидеть контекст, проверить нет ли где «представляйся как Verstak» или подобного в промптах:
```bash
grep -n "Verstak" src/components/*.tsx electron/**/*.ts
```

---

## 7. ВЕРСИЯ И CHANGELOG

В `package.json` поднять версию:
- Текущая: `1.0.0`
- Предложение: `1.1.0` (минорный — rebrand, не ломает API)

Создать `CHANGELOG.md` если нет, или добавить запись:
```markdown
## [1.1.0] — 2026-05-XX
### Changed
- Product rebranded from "Verstak" to "Verstak"
- New logo, icons, app identity (ru.verstak.ide → ru.verstak.ide)
- Config folder `.verstak/` → `.verstak/` (auto-migration on first open)
```

---

## 8. ПОРЯДОК ВЫПОЛНЕНИЯ (рекомендованный)

1. ✅ **Git checkpoint** — `git add -A && git commit -m "rebrand: pre-rename checkpoint"`
2. ✅ **package.json** — name + appId + productName + всё про сборку
3. ✅ **Массовая текстовая замена** по всем файлам (см. таблицу из п.1). Можно через sed/regex:
   ```bash
   # Аккуратно: используй preview-режим (без -i) сначала чтобы увидеть diff
   grep -rl "verstak" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=out --exclude-dir=release . | xargs sed -i.bak 's/verstak/verstak/g'
   grep -rl "Verstak" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=out --exclude-dir=release . | xargs sed -i.bak 's/Verstak/Verstak/g'
   # Удалить .bak файлы
   find . -name "*.bak" -not -path "*/node_modules/*" -delete
   ```
4. ✅ **Переименовать `.verstak/` → `.verstak/`** в корне проекта
5. ✅ **Заменить иконки** в `resources/` (см. п.3)
6. ✅ **Проверка** — пройти diff глазами, особенно `package.json`, `electron/main.ts`, `OnboardingWizard.tsx`
7. ✅ **Тестовый билд**:
   ```bash
   npm install --legacy-peer-deps
   npm run electron-rebuild
   npm run type   # TypeScript должен пройти
   npm test       # тесты должны пройти
   npm run dev    # приложение должно запуститься с новым именем
   ```
8. ✅ **Production билд** (для Windows как первый таргет):
   ```bash
   npm run dist:win
   # Результат: release/Verstak-Setup-1.1.0-x64.exe и release/Verstak-Portable-1.1.0-x64.exe
   ```
9. ✅ **Переименовать корневую папку** `verstak` → `verstak` (см. п.4)
10. ✅ **Git commit + tag**:
    ```bash
    git add -A
    git commit -m "rebrand: Verstak → Verstak (logo, icons, appId, all references)"
    git tag v1.1.0-verstak
    ```

---

## 9. DEFINITION OF DONE

Задача считается закрытой когда:

- [ ] `package.json` содержит `"name": "verstak"`, `"productName": "Verstak"`, `"appId": "ru.verstak.ide"`
- [ ] `npm run type` проходит без ошибок
- [ ] `npm test` проходит зелёным
- [ ] `npm run dev` запускает приложение, в заголовке окна — **Verstak**
- [ ] При новом проекте создаётся папка `.verstak/`, не `.verstak/`
- [ ] `npm run dist:win` собирает `Verstak-Setup-1.1.0-x64.exe` с правильной иконкой и именем приложения
- [ ] Поиск `grep -ri "verstak\|Verstak" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=out --exclude-dir=release` возвращает **0 совпадений** (либо только в исторических changelog/docs где упоминание оправдано)
- [ ] Git tag `v1.1.0-verstak` создан
- [ ] Папка корня проекта переименована на `verstak/` (если решено делать)

---

## 10. ЧТО НЕ ВХОДИТ В ЭТУ ЗАДАЧУ

- ❌ Регистрация доменов `verstak.io` / `verstak.ru` — отдельно у Pavel
- ❌ Подача trademark в Роспатент — отдельно
- ❌ Создание GitHub репо `verstak/` — отдельно (после rename папки можно делать `git remote set-url`)
- ❌ Деплой лендинга — отдельно, лендинг уже готов в `landings/verstak/`
- ❌ Уведомление существующих пользователей — пользователей пока нет (MVP)
- ❌ Создание сертификата для подписи .exe — отдельная задача
- ❌ Маркетинг/анонс — после выпуска первого Verstak-билда

---

## 11. РИСКИ И ВОЗМОЖНЫЕ ПРОБЛЕМЫ

| Риск | Митигация |
|---|---|
| Существующая установка пользователя ломается из-за смены `.verstak` → `.verstak` | На текущей MVP-стадии пользователей публично нет, риск нулевой. Если нужно — добавить fallback миграцию в `loader.ts` |
| Кто-то из тестеров уже запустил с appId `ru.verstak.ide` — Windows покажет 2 приложения | Уведомить тестеров, удалить старое вручную |
| Sed-замена сломает что-то в комментах | Diff глазами + `npm test` поймает регрессии |
| Иконка `.ico` сгенерилась неоптимально | Проверить визуально в Explorer, при необходимости пересобрать с разными размерами |
| Несовпадение между корневой папкой `verstak/` и git remote (если бы он был) | На этой стадии не критично, в `.git/config` поправить вручную |

---

## 12. КОНТАКТЫ ПОСЛЕ ЗАДАЧИ

После выполнения — сообщить **Pavel** с:
- Размер диффа (строк +/-)
- Артефакты `release/Verstak-Setup-*.exe` (приложить или дать путь)
- Скриншот окна приложения с новым именем в заголовке
- `git log --oneline -5` чтобы видеть финальные коммиты
