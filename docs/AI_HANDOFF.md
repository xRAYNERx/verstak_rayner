# AI Handoff: Verstak 2.0.11 Grok, skills, connectors, and recovery transfer

Last updated: 2026-07-21
Source branch: `codex/reapply-2.0.11`
Target use: pull Rayner's local fixes from the fork into Pavel's main Verstak repository
Local version alignment: `2.0.11`

## Read This First

This push package includes several local product decisions restored after Pavel upstream updates plus new chat/skills fixes. Preserve Rayner's accepted local behavior even if upstream currently differs.

Do not include the untracked `mcps/chrome-devtools/` folder unless Pavel explicitly asks for that local tooling.

Before transferring, read:

- `docs/VERSTAK_CHANGELOG_TRACKER.md`
- `docs/RESTORE_AFTER_UPSTREAM_UPDATE.md`
- `docs/DEVELOPER_PUSH_LOG.md`
- `docs/PATCHNOTES_DRAFT.md`

## What Changed

### Grok Build model catalog and run labels

Main files:

- `electron/ai/grok-cli.ts`
- `electron/ai/model-discovery.ts`
- `src/lib/model-catalog.ts`
- `src/components/Chat.tsx`
- `tests/ai/model-discovery.test.ts`
- `tests/ai/model-registry.test.ts`
- `tests/ipc/provider-doctor.test.ts`

Important behavior:

- Grok Build now uses the live `grok-4.5` model id and no longer exposes or routes to removed `grok-composer-2.5-fast`.
- The CLI gate validates the resolved selected Grok model before starting the child process.
- The chat work-progress panel now labels runs from the active chat session, but ignores removed/stale model ids such as `grok-composer-2.5-fast` and repairs that saved chat session model to the current provider model.
- Do not restore the removed composer plain-output path unless Grok reintroduces that model and it is verified live.

Verify:

- Open Grok Build model settings and confirm only current live model ids are shown.
- Select Grok Build `grok-4.5`, send a chat request from a chat that previously used composer, and confirm `Ход работы` shows the selected model, not `grok-composer-2.5-fast`.
- Run the model discovery/registry/provider doctor tests listed below.

### Skills: manual recommendation tags and per-message application

Main files:

- `src/components/SkillsView.tsx`
- `src/components/Chat.tsx`
- `src/components/ComposerToolsMenu.tsx`
- `src/components/SlashCommandPopup.tsx`
- `src/store/skillStore.ts`
- `src/lib/skill-suggest.ts`
- `src/lib/skill-user-tags.ts`
- `src/types/api.d.ts`
- `tests/lib/skill-suggest.test.ts`
- `tests/store/skill-store.test.ts`

Important behavior:

- Each skill card can have user-defined local tags.
- Manual tags are included in skill search and chat suggestion scoring.
- Selecting a skill from the Skills section, slash menu, or chat tools queues it for the current composer draft only.
- The selected skill is attached to the current message and sent to the model with that message; it must not become a global skill across all chats.
- Tags are stored in browser localStorage under `verstak.skillUserTags.v1`.

Verify:

- Add tags to a skill card in the Skills section.
- Type a matching task in chat and confirm the skill is suggested.
- Select a skill in one chat, switch chats, and confirm it was not applied globally.

### Settings and project panel recovery

Main files:

- `src/components/Settings.tsx`
- `src/components/Sidebar.tsx`
- `src/styles/layout.css`
- `docs/VERSTAK_CHANGELOG_TRACKER.md`
- `docs/RESTORE_AFTER_UPSTREAM_UPDATE.md`

Important behavior:

- Settings -> Profiles is intentionally disabled and marked `Soon`.
- Project Management -> Browser and Design are intentionally disabled and marked `Soon`.
- Connector secret fields use a flush-right show/hide eye button.
- Preserve the recovery tracker; it is the fast audit source after future upstream updates.

Verify:

- Open Settings and confirm Profiles is closed as `Soon`.
- Open Project Management and confirm Browser/Design are `Soon` and do not open unfinished panels.
- Open connector settings and confirm secret fields reveal/hide values with the eye button at the right edge.

## Validation Run Locally

- `npm.cmd run check:mojibake`
- `npm.cmd test -- tests/lib/skill-suggest.test.ts tests/store/skill-store.test.ts tests/ai/model-discovery.test.ts tests/ai/model-registry.test.ts tests/ipc/provider-doctor.test.ts`
- `npm.cmd run build`

## Transfer Notes For Pavel's AI

- Preserve the current installed/local version alignment at `2.0.11` unless Pavel is intentionally releasing a newer version.
- Preserve the tracker files; they are internal coordination docs, not user-facing release features.
- Do not reintroduce old Grok IDs such as `grok-composer-2.5-fast` or `grok-build`.
- Do not route manually selected skills through global `activeSkillId`; use the per-draft queue and applied-skill message context.
- Keep user-facing patch notes human-readable and concrete. Use `docs/PATCHNOTES_DRAFT.md`.

---

# Previous AI Handoff: Verstak 2.0.7 project settings and chat polish transfer

Last updated: 2026-07-16
Source branch: `codex/reapply-2.0.7`
Target use: pull Rayner's local fixes from the fork into Pavel's main Verstak repository
Local version alignment: `2.0.7`

## Read This First

This package contains the latest local fixes after the previous push. Keep Pavel's release version unless the release owner explicitly bumps it. Rayner's local `package.json` and installed app are aligned to `2.0.7`.

Do not include the untracked `mcps/chrome-devtools/` folder unless Pavel explicitly asks for that local tooling.

## What Changed

### Project Settings Encoding Fix

Main files:

- `src/components/ProjectSettings.tsx`
- `scripts/check-mojibake.cjs`
- `scripts/precommit.cjs`
- `package.json`
- `docs/PROJECT_SETTINGS_ENCODING_FIX_PLAN.md`

Important behavior:

- The project settings window must show normal Russian UI text instead of mojibake strings.
- The fix is for static interface copy only; project names, dates, notes, labels, and other user data must remain unchanged.
- A new `check:mojibake` guard scans source/docs/scripts for common broken UTF-8/Windows-1251 fragments.
- The precommit script runs the mojibake guard before the existing checks, so this class of regression is blocked earlier.
- `docs/PROJECT_SETTINGS_ENCODING_FIX_PLAN.md` explains the diagnosis and the prevention plan.

Verify:

- Open project settings from a project gear button.
- Confirm all headings, labels, helper text, buttons, placeholders, and warnings are readable Russian.
- Run `npm.cmd run check:mojibake` and confirm it passes.

### Chat View Refresh

Main files:

- `src/components/Chat.tsx`
- `src/styles/shell-atelier.css`

Important behavior:

- The chat stream has a calmer document-style layout around messages, date dividers, user bubbles, assistant bubbles, and work-progress blocks.
- While scrolling a chat, a small date label appears above the stream to show the date of the visible messages.
- The date label is driven from message metadata and should update during scroll without changing message content.
- The composer area remains visually separated from the chat stream.

Verify:

- Open a chat with messages from different days and scroll through it.
- Confirm the visible date label appears and changes as expected.
- Confirm user messages, assistant messages, date dividers, and AI work panels remain readable in dark and light themes.

## Validation To Run After Transfer

- `npm.cmd run check:mojibake`
- `npm.cmd run type`
- `npm.cmd run build`
- `git diff --check`
- local deploy/build verification if this is being packaged into Rayner's installed app
- manual checks listed above

## Transfer Notes For Pavel's AI

- Preserve `scripts/check-mojibake.cjs` and the `check:mojibake` npm script.
- Preserve the precommit mojibake guard; do not remove it as an unrelated script.
- Do not reintroduce the old broken strings in `ProjectSettings.tsx` from another branch or generated patch.
- Preserve the visible-date metadata attributes added in `Chat.tsx`; the chat label depends on them.
- Keep the chat CSS aligned with both dark and light themes.
- Keep user-facing patch notes human-readable and concrete. Use `docs/PATCHNOTES_DRAFT.md`.
