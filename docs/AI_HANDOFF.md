# AI Handoff: Verstak local updates

Last updated: 2026-07-15
Source branch: `codex/reapply-1.9.5`
Target use: pull these changes from Rayner's fork into Pavel's main Verstak repository
Local version alignment: `2.0.6`

## Read This First

This package contains several connected renderer, IPC, storage, and type changes. Do not cherry-pick only React/CSS files without the matching Electron IPC, preload, storage, and type updates.

Keep Pavel's target release version unless the release owner explicitly bumps it. Rayner's local `package.json` and `package-lock.json` are aligned to installed Verstak `2.0.6`.

Do not include the untracked `mcps/chrome-devtools/` folder unless Pavel explicitly wants that local tooling copied into the main repository.

## What Changed

### 1. Chat Performance And Long Histories

Main files:

- `electron/ipc/chats.ts`
- `electron/storage/chats.ts`
- `src/store/projectStore.ts`
- `src/components/Chat.tsx`
- `src/styles/layout.css`
- `src/types/api.d.ts`

Important behavior:

- Chat history can now load by windows through `chats:list-window` instead of always hydrating the full session.
- Project/chat switching loads an initial window of recent messages and exposes a "show earlier messages" control when older messages exist.
- Long `thinking` content can stay out of initial window loads unless explicitly requested.
- Side work during project switch is deferred so switching projects is less likely to block the visible transition.
- Chat rendering is memoized to reduce input lag in long conversations.

Verify:

- Open a long chat and confirm only recent messages render first.
- Click "Показать ранние сообщения" and confirm older messages prepend without losing the current chat.
- Switch between large projects and confirm the UI remains responsive.
- Send a message after loading older history and confirm the full stored chat context is still used for the model.

### 2. Stop Button And Concurrent Runs

Main files:

- `src/components/Chat.tsx`
- `src/components/SideChat.tsx`
- `electron/ipc/ai.ts`

Important behavior:

- The stop button now clears the visible run immediately and sends the abort to main asynchronously.
- Manual stop is scoped to the current `sendId`; it should not clear a different chat/project stream.
- Queued follow-up messages are not auto-started immediately after manual stop.
- Plain/CLI provider runs receive the abort signal so `ai:stop` can actually interrupt them.

Verify:

- Start two runs in different projects/chats.
- Stop one run and confirm the other remains running.
- Press stop while a queued follow-up exists and confirm the stopped run does not immediately start the next queued item.
- Stop a Grok CLI run and confirm it exits instead of continuing to stream.

### 3. Copyable Text Blocks

Main files:

- `electron/ipc/clipboard.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/components/Markdown.tsx`
- `src/types/api.d.ts`

Important behavior:

- Markdown code blocks and `copy`/plain text blocks can copy through Electron clipboard IPC.
- Browser clipboard and legacy textarea copy remain as fallbacks.

Verify:

- Ask the model to return a copyable text block.
- Click copy and paste into another field.
- Confirm numbered lists copy as plain text with numbering intact.

### 4. File Preview And File Tree Stability

Main files:

- `electron/ipc/files.ts`
- `electron/shared-types.ts`
- `src/components/FilesView.tsx`
- `src/types/api.d.ts`
- `src/styles/layout.css`

Important behavior:

- Large project folders are bounded by node and per-directory limits.
- Heavy top-level folders such as logs, reports, campaigns, creatives, terminals, and agent tools are summarized instead of recursively expanded.
- Truncated directory entries are marked so the UI does not try to open fake paths.
- Collapsed folder rows show lightweight metadata.

Verify:

- Open the Files view in a large project.
- Confirm tree loading is faster and heavy folders appear as summaries.
- Click regular files and confirm preview still works.
- Click summarized/truncated rows and confirm no broken file-open action occurs.

### 5. Project Settings Encoding And Layout

Main files:

- `src/components/ProjectSettings.tsx`

Important behavior:

- Mojibake/Russian text corruption in project settings was fixed.
- Project settings keep the new modal structure: identity, notes, summary, labels, group, location, status, color, remote checks, project data, and management actions.
- This package does not rewrite the whole settings system again; it preserves the already-applied design direction and fixes broken copy.

Verify:

- Open project settings and confirm Russian labels are readable.
- Check labels, group, status, color, project data actions, archive, notifications, and delete confirmation.
- Confirm close/save buttons still work.

### 6. Notification Window Click-Through

Main files:

- `electron/notification-window.ts`
- `electron/preload-notification.ts`
- `src/notification/NotificationApp.tsx`
- `src/notification/notification.css`
- `src/notification/toast-api.d.ts`

Important behavior:

- The transparent notification window ignores mouse events outside the visible toast.
- Hovering the toast temporarily enables mouse handling so the toast can still be clicked.

Verify:

- Show a completion notification.
- Confirm screen areas outside the visible toast remain clickable.
- Hover and click the toast itself and confirm it still opens the app/project.

### 7. Project Sidebar Sections

Main files:

- `src/components/Sidebar.tsx`
- `src/i18n/ru.ts`

Important behavior:

- The project-side panel title is now "Управление проектом".
- Browser and Design items are marked as "Скоро" and are not active project tools yet.

Verify:

- Open the project-side panel and confirm the title.
- Confirm Browser and Design show the "Скоро" state and cannot be opened as unfinished tools.

### 8. Agent Runs Panel

Main files:

- `src/components/AgentRunsPanel.tsx`

Important behavior:

- Agent runs load with a limit and can show more on demand.
- Auto-refresh is active only while a run is queued or running.

Verify:

- Open "Прогоны" / history of AI work.
- Confirm the first page loads and "Показать еще" expands the list.
- Start a run and confirm active status refreshes.

## Transfer Notes

- Preserve `2.0.6` version alignment unless Pavel intentionally changes release metadata.
- Preserve the design guide decisions already present in the repo: no old hover shadows, no nested card stacks, no oversized badges, no one-off hardcoded colors.
- Keep user-facing copy concise and human-readable.
- Do not reintroduce native browser title tooltips for project paths.
- After transfer, run `npm.cmd run type` and `npm.cmd run build`, then manually check the changed app sections above.
