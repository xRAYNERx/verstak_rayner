# AI Handoff: Verstak 2.2.2 Rayner fixes

Last updated: 2026-07-28
Source branch: `codex/reapply-2.0.11`
Target use: transfer Rayner fork changes into Pavel's main Verstak repository
Installed version checked before local reapply: `2.2.2`

## Read This First

This push contains Rayner's local fixes that must be preserved when merging into the main app. The installed app was updated to `2.2.2`, then the missing local fixes were reapplied directly to the installed `app.asar` without rebuilding from the stale local `2.0.11` source tree.

Important: the local repository is still based on an older recovery branch. When transferring, apply the behavior and source changes carefully onto the current main branch instead of blindly replacing newer upstream files.

Do not include untracked local tooling unless explicitly requested:

- `mcps/chrome-devtools/`
- `scripts/wordstat-connector-live.mjs`

## Included Areas

### Chat and AI run safety

Files to inspect first:

- `electron/ipc/ai.ts`
- `electron/main.ts`
- `src/components/Chat.tsx`
- `src/styles/layout.css`

What to preserve:

- Stop/cancel now targets the intended active run instead of stopping unrelated work in another chat.
- Interrupted runs can mark the pending assistant placeholder with a visible error instead of leaving an empty answer.
- Chat startup failures now write a visible error into the pending answer, including help-chat sends.
- Notification/toast hit areas were adjusted so the visible toast does not block interaction across the whole side of the app.

### File preview panel

Files to inspect first:

- `electron/ipc/files.ts`
- `electron/preload.ts`
- `src/types/api.d.ts`
- `src/components/FilePreviewPanel.tsx`
- `src/styles/layout.css`

What to preserve:

- File preview resolves skill paths and known safe roots more reliably.
- Oversized text files no longer fail with a dead-end error only; the preview can load the file in safe chunks.
- The side preview panel has friendlier user-facing errors when a file cannot be shown.
- Secret scanning/redaction still applies to file content before it reaches the renderer.

### Project tasks

Files to inspect first:

- `src/components/RemindersView.tsx`
- `src/components/Chat.tsx`
- `src/styles/layout.css`

What to preserve:

- The project task screen is being developed as the replacement for old reminders.
- The UI supports project tasks with status, priority, dates, filters, and message-to-task creation.
- Keep this local-first for now. Do not add Bitrix polling or cloud sync in this transfer.

### Connectors token reveal

Files to inspect first:

- `src/components/Settings.tsx`
- `src/styles/layout.css`

What to preserve:

- Secret/token inputs in connectors use a show/hide eye button.
- The eye button must sit flush against the right edge of the input.
- Do not implement this by patching built JS through PowerShell text reads; it previously caused UTF-8 mojibake and a recursive `SecretInput` renderer crash.

### Project management gating

Files to inspect first:

- `src/components/Sidebar.tsx`

What to preserve:

- `Браузер` and `Дизайн` in project management are marked `Скоро` and blocked until those sections are ready.
- `Профили` remains a disabled/soon section in app settings.

## Installed App Reapply Notes

After the user installed Verstak `2.2.2`, the following were missing in the installed app and were reapplied into `app.asar`:

- connector token show/hide eye
- `Браузер` and `Дизайн` as `Скоро` in project management

Verification on installed app:

- installed `package.json` inside `app.asar` reports `2.2.2`
- settings bundle contains normal Russian text and no `Рџ` mojibake marker
- settings bundle contains `SecretInput` without recursive self-rendering
- main renderer bundle contains `soonReason` for `Браузер` and `Дизайн`
- installed app launches successfully

## Transfer Warnings

- Preserve current upstream work from Pavel. Do not overwrite newer `2.2.x` files with the older recovery branch wholesale.
- Keep the Verstak UI design decisions: compact cards, clear borders, no random hover shadows, no nested-card clutter, and concise user-facing copy.
- Keep patch notes user-facing and concrete. Do not mention internal class names, file paths, or reasons for tiny visual changes.
