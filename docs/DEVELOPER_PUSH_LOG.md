# Developer Push Log

Этот файл нужен для ИИ, который переносит изменения из форка в основной репозиторий.
Здесь фиксируется не вся история проекта, а конкретный пакет последнего пуша: что вошло, куда смотреть, как проверить и что не трогать.

## Latest Push Package

- Date: 2026-07-15
- Branch: `codex/reapply-1.9.5`
- Commit: after commit
- Title: chat stability, file preview, project settings text, notifications, and long-chat performance

### Included

- Chat stop behavior:
  - stop is optimistic in the renderer and scoped to the current `sendId`
  - stop no longer waits for IPC before clearing the visible run
  - manual stop suppresses immediate auto-start of queued follow-up messages
  - plain/CLI provider loop receives the abort signal
- Long-chat performance:
  - chat history can load in windows through `chats:list-window`
  - active chat state tracks total count, earlier-history availability, and older-message loading
  - project switch side work is deferred
  - chat message rendering is memoized
- Copyable text blocks:
  - new Electron clipboard IPC
  - Markdown copy buttons use Electron clipboard first, browser/textarea fallback second
- File tree and preview stability:
  - large file trees are bounded
  - heavy project folders can be collapsed into summary rows
  - file nodes carry collapsed/truncated metadata
- Project settings:
  - Russian mojibake in project settings is fixed
  - current project settings layout and actions are preserved
- Notifications:
  - toast window becomes mouse-transparent outside visible toast cards
  - toast cards remain clickable on hover
- Project-side navigation:
  - "Проект" label is renamed to "Управление проектом"
  - Browser and Design project tabs are marked as "Скоро"
- Agent runs:
  - runs list uses a configurable limit
  - active polling runs only while queued/running items exist

### Files To Inspect First

- Chat and stop behavior:
  - `src/components/Chat.tsx`
  - `src/components/SideChat.tsx`
  - `electron/ipc/ai.ts`
- Chat storage/window loading:
  - `electron/ipc/chats.ts`
  - `electron/storage/chats.ts`
  - `src/store/projectStore.ts`
  - `src/types/api.d.ts`
- Copyable text:
  - `electron/ipc/clipboard.ts`
  - `electron/main.ts`
  - `electron/preload.ts`
  - `src/components/Markdown.tsx`
- File tree:
  - `electron/ipc/files.ts`
  - `electron/shared-types.ts`
  - `src/components/FilesView.tsx`
- Project settings/navigation:
  - `src/components/ProjectSettings.tsx`
  - `src/components/Sidebar.tsx`
  - `src/i18n/ru.ts`
- Notifications:
  - `electron/notification-window.ts`
  - `electron/preload-notification.ts`
  - `src/notification/NotificationApp.tsx`
  - `src/notification/notification.css`
- Agent runs:
  - `src/components/AgentRunsPanel.tsx`

### Not Included

- Untracked `mcps/chrome-devtools/` is local tooling and should not be staged unless Pavel explicitly asks for it.
- No local deploy package or installer artifact is included in Git.

### Validation

- `git diff --check`
- `npm.cmd run type`
- `npm.cmd run build`

### Transfer Notes For Pavel's AI

- Transfer this package as a connected set: renderer changes depend on matching Electron IPC, preload, storage, and type updates.
- Preserve installed/local version alignment. This working package is aligned to `2.0.6`.
- Preserve the existing Verstak UI design guide decisions; do not reintroduce old hover shadows, nested cards, oversized badges, or one-off hardcoded colors.
- After transfer, manually verify long chat loading, stop behavior with concurrent runs, copyable blocks, file preview, project settings text, notification click-through, and disabled Browser/Design tabs.
- Use `docs/PATCHNOTES_DRAFT.md` as the source for release notes.

### Patchnote Source

- Use `docs/PATCHNOTES_DRAFT.md`

## Recent Push Packages

- No previous entries in this file
