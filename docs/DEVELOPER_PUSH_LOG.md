# Developer Push Log

## Latest Push Package

- Date: 2026-07-28
- Branch: `codex/reapply-2.0.11`
- Commit: after commit
- Title: Reapply Rayner chat, file preview, connector and project-task fixes on top of 2.2.2

### Included

- Chat and AI run safety:
  - Stop/cancel tracks active run ids with chat ownership metadata.
  - Interrupted runs can write a visible error into the pending assistant message.
  - Chat and help-chat send startup failures no longer leave an invisible pending answer.
  - Toast interaction bounds were adjusted so notifications do not block the whole side of the UI.
- File preview:
  - Added safe chunked file reading for large previews.
  - Added renderer API typings and preload bridge for `files:read-chunk`.
  - Improved file preview panel states, load-more behavior, and friendly errors.
- Project tasks:
  - Continued the project task manager work in the former reminders view.
  - Added task-focused UI states, filters, editing, and chat-message task creation support.
- Connectors and project management reapply in installed app:
  - Reapplied token show/hide eye to installed 2.2.2 settings bundle.
  - Reapplied `Браузер` and `Дизайн` as `Скоро` in installed 2.2.2 project management.
- Version metadata:
  - Local `package.json` and lockfile aligned to installed `2.2.2` before push.

### Files To Inspect First

- `electron/ipc/ai.ts`
- `electron/ipc/files.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/components/Chat.tsx`
- `src/components/FilePreviewPanel.tsx`
- `src/components/RemindersView.tsx`
- `src/components/Settings.tsx`
- `src/components/Sidebar.tsx`
- `src/styles/layout.css`
- `src/types/api.d.ts`
- `package.json`
- `package-lock.json`
- `docs/AI_HANDOFF.md`
- `docs/PATCHNOTES_DRAFT.md`

### Not Included

- `mcps/chrome-devtools/` remains untracked local tooling.
- `scripts/wordstat-connector-live.mjs` remains an untracked local probe.
- Built release artifacts and patched installed `app.asar` are not committed.
- No Bitrix polling or cloud task sync is included.

### Validation

- Installed app version checked from `app.asar`: `2.2.2`.
- Installed `app.asar` patched directly after update, without rebuilding from stale local source.
- Installed app launched successfully after reapply.
- Source validation to run before final transfer: `npm.cmd run check:mojibake`, `git diff --check`, and `npm.cmd run build`.

### Transfer Notes For Pavel's AI

- Do not copy the older recovery branch over current upstream files wholesale. Port the behavior onto the current main branch.
- Preserve `SecretInput` as a normal React component in source. Avoid built-bundle text patching for connector token reveal.
- Keep file preview security checks and secret redaction in place when transferring chunked loading.
- Keep AI stop scoped to the intended run; do not restore global stop behavior that aborts unrelated active chats.
- Use `docs/PATCHNOTES_DRAFT.md` for user-facing release notes.

### Patchnote Source

- Use `docs/PATCHNOTES_DRAFT.md`
