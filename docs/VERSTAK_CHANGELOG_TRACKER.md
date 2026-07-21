# Verstak Final Change Tracker

This file tracks Rayner/Codex final decisions that must survive upstream updates.
It is not a user-facing changelog and not a list of failed intermediate attempts.

Use this file after every Pavel update:

1. Check items marked `must stay`.
2. Restore items marked `lost after upstream update`.
3. Add new accepted final changes with files and quick markers.
4. Do not rely only on memory or on a broad git diff.

## Current Audit

Date: 2026-07-21
Installed version checked: 2.0.11
Local package version checked: 2.0.11

### Lost After Upstream Update And Restored

#### Project Management: Browser and Design are disabled as Soon

Status: restored locally

Section: left project management panel

Expected behavior:
- Browser is visible but disabled.
- Design is visible but disabled.
- Both items show the `Soon` badge.
- Clicking either item must not switch the project panel to an unfinished feature.

Files:
- `src/components/Sidebar.tsx`

Fast code markers:
- `id: 'browser'` has `soon: true`
- `id: 'design'` has `soon: true`
- `.gg-nav-soon` exists in `src/styles/layout.css`

Manual check:
- Open the project management panel.
- In the Tools group, Browser and Design should be marked `Soon` and not open.

#### General Settings: Profiles are disabled as Soon

Status: restored locally

Section: Settings -> Profiles

Why this is intentional:
- The current upstream branch contains a live local `ProfilesTab`, but Rayner's product decision is to keep Profiles closed until real accounts, organizations, roles, and team access are ready.

Expected behavior:
- Profiles item is visible in Settings.
- Profiles item shows the `Soon` badge.
- The working profile switcher is not exposed to a regular user.
- If the route is opened directly, it shows a placeholder card instead of the live profile UI.

Files:
- `src/components/Settings.tsx`
- `src/styles/layout.css`

Fast code markers:
- `ProfileSoonPage`
- settings nav item `id: 'profiles'` has `soon: true` and `disabled: true`
- `ProfilesTab` is not imported in `Settings.tsx`

Manual check:
- Open Settings.
- Profiles should be marked `Soon` and should not behave like a complete working account system.

### Verified Present In Current 2.0.11 Local Build

#### Skills: manual recommendation tags

Status: added locally

Expected behavior:
- Each skill card can store user-defined local tags.
- Tags are used by Skills search and by chat skill suggestions while the user types.
- Tags are local UI metadata and do not rewrite the skill's `SKILL.md`.

Files:
- `src/components/SkillsView.tsx`
- `src/lib/skill-user-tags.ts`
- `src/lib/skill-suggest.ts`
- `src/store/skillStore.ts`
- `src/types/api.d.ts`
- `tests/lib/skill-suggest.test.ts`

Fast code markers:
- `verstak.skillUserTags.v1`
- `Теги для рекомендаций`
- `tagTokens`
- `user_tags`

Manual check:
- Open Skills.
- Add tags to a skill.
- Type a matching task in chat and confirm the skill is suggested.

#### Skills: selected skill applies only to current message

Status: added locally

Expected behavior:
- Selecting a skill from Skills, slash menu, or chat tools attaches it to the current composer draft.
- Sending that message passes the skill to the model with that message.
- The selected skill must not become active across all chats.

Files:
- `src/App.tsx`
- `src/components/Chat.tsx`
- `src/components/ComposerToolsMenu.tsx`
- `src/components/SlashCommandPopup.tsx`
- `src/store/skillStore.ts`
- `tests/store/skill-store.test.ts`

Fast code markers:
- `pendingDraftSkillId`
- `queueDraftSkill`
- `consumeDraftSkill`
- `activeSkillIdForSend: string | null = null`

Manual check:
- Select a skill in one chat.
- Confirm it appears under the current composer/message only.
- Switch to another chat and confirm the skill is not applied there automatically.

#### Chat work progress: selected model label

Status: added locally

Expected behavior:
- The `Ход работы` panel shows the provider/model selected for the active chat session.
- If Grok Build `grok-4.5` is selected, progress should not display removed `grok-composer-2.5-fast`.
- Chat session provider/model should win over stale provider hook state.

Files:
- `src/components/Chat.tsx`

Fast code markers:
- `progressProviderLabel`
- `activeChatSession`
- `agentModelLabel`

Manual check:
- Select Grok Build `grok-4.5` in a chat.
- Send a task.
- Confirm the work-progress title/detail references `grok-4.5`, not `grok-composer-2.5-fast`.

#### Connectors: show and hide secret values

Status: verified present

Expected behavior:
- Connector secret fields have an eye button.
- The button shows and hides tokens, webhook URLs, passwords, and client secrets.
- The button sits flush against the right edge of the field with no empty gap.

Files:
- `src/components/Settings.tsx`
- `src/styles/layout.css`
- `electron/ipc/clipboard.ts`
- `electron/preload.ts`

Fast code markers:
- `SecretInput`
- `.gg-secret-toggle`
- `right: 0`
- `height: 100%`

Manual check:
- Open Settings -> Connectors.
- Open any connector with a token field.
- The eye button should reveal and hide the value.

#### Project Settings: readable Russian UI and mojibake guard

Status: verified present

Expected behavior:
- Project settings window uses readable Russian interface text.
- No mojibake strings such as broken `Рџ...` UI labels should appear in the actual app.
- `npm run check:mojibake` must pass.

Files:
- `src/components/ProjectSettings.tsx`
- `scripts/check-mojibake.cjs`
- `scripts/precommit.cjs`
- `docs/PROJECT_SETTINGS_ENCODING_FIX_PLAN.md`
- `package.json`

Fast code markers:
- `check:mojibake` script exists in `package.json`
- `ProjectSettings.tsx` contains readable labels such as `Параметры проекта`, `Заметки`, `Сведения`, `Последние действия`

Manual check:
- Open a project gear/settings window.
- All static UI labels should be readable Russian.
- Run `npm.cmd run check:mojibake`.

#### Chat: visible date label while scrolling

Status: verified present

Expected behavior:
- When scrolling chat history, a compact date label appears above the chat stream.
- The label follows visible messages and does not modify message content.

Files:
- `src/components/Chat.tsx`
- `src/styles/shell-atelier.css`

Fast code markers:
- `.gg-chat-visible-date`
- `data-message-date-label`
- `visibleDateLabel`

Manual check:
- Open a chat with messages from several dates.
- Scroll the history and confirm the visible date label updates.

#### Chat: copyable framed text blocks

Status: verified present

Expected behavior:
- A specially formatted copy block has a visible `Copy` button.
- Copy uses Electron clipboard first, then browser clipboard fallback.
- Numbered lines should copy as real text.

Files:
- `src/components/Markdown.tsx`
- `src/styles/markdown.css`
- `electron/ipc/clipboard.ts`
- `electron/preload.ts`

Fast code markers:
- `.gg-copy-block`
- `copyBlockRegex`
- `window.api.clipboard.writeText`
- `clipboard:write-text`

Manual check:
- Ask the chat to send text in a copyable frame.
- Press the copy button and paste into any text field.

#### Chat: side file preview panel

Status: verified present

Expected behavior:
- File artifacts/paths can be opened in the right side panel.
- Relative paths are resolved against the active project where possible.
- Unsupported or missing files show a readable error instead of raw stack noise.

Files:
- `src/components/FilePreviewPanel.tsx`
- `src/components/ArtifactPreview.tsx`
- `electron/ipc/files.ts`
- `src/styles/layout.css`

Fast code markers:
- `FilePreviewPanel`
- `files:resolve-preview-path`
- `resolvePreviewPath`
- `.gg-file-preview`

Manual check:
- Open a file link/path from chat.
- Markdown/text/html should preview in the side panel; missing files should show a clear message.

#### Chat/help isolation: Help does not kill project work

Status: verified present

Expected behavior:
- Opening Help while a project task is running must not stop the project task.
- Help has its own global chat and snapshot state.
- Background project stream events continue routing to the correct project/chat.

Files:
- `src/components/Chat.tsx`
- `src/store/projectStore.ts`
- `src/store/session-snapshot.ts`
- `src/lib/help-scope.ts`
- `electron/storage/help-scope.ts`

Fast code markers:
- `HELP_PROJECT_PATH`
- `__verstak_help__`
- `helpMode`
- `applyEventToChat`
- `background-project events`

Manual check:
- Start a project task.
- Open Help.
- Return to the project and confirm the task is still running or completed normally.

#### Chat stop button: stop current run by sendId

Status: verified present

Expected behavior:
- Stop should target the active run for the current chat/help lane.
- It should not stop a different project or unrelated chat.

Files:
- `src/components/Chat.tsx`
- `src/lib/own-run.ts`
- `src/store/projectStore.ts`
- `electron/ipc/ai.ts`
- `electron/preload.ts`

Fast code markers:
- `findRunForChat`
- `registerSendOwner`
- `ai.stop(sendId)`
- `stop: (sendId: number)`

Manual check:
- Run two tasks in different projects/chats.
- Press Stop in one active chat.
- Only that run should stop.

#### Grok Build: current live model id

Status: verified present

Expected behavior:
- Grok Build should not keep using removed ids like `grok-composer-2.5-fast`.
- Current local catalog uses `grok-4.5`.
- Stale saved ids should be detected and repaired through model availability checks.

Files:
- `electron/ai/grok-cli.ts`
- `electron/ai/model-discovery.ts`
- `src/lib/model-catalog.ts`
- `tests/ai/model-discovery.test.ts`
- `tests/ai/model-registry.test.ts`
- `tests/ipc/provider-doctor.test.ts`

Fast code markers:
- `DEFAULT_GROK_CLI_MODEL = 'grok-4.5'`
- `GROK_CLI_MODELS`
- `resolveModelAvailability`
- `checkModelAvailable`

Manual check:
- Open model settings for Grok Build.
- It should show the current available model id and not `grok-composer-2.5-fast`.

#### Long agent timeout: 90 minutes

Status: verified present

Expected behavior:
- Long tasks should not be stopped after 30 minutes by the default watchdog.
- Default agent run timeout is 90 minutes.

Files:
- `electron/ai/run-lifecycle.ts`
- `electron/ipc/ai.ts`
- `tests/ai/run-lifecycle.test.ts`

Fast code markers:
- `DEFAULT_AGENT_RUN_TIMEOUT_MS = 90 * 60 * 1000`
- `agent_run_timeout_ms`

Manual check:
- A long run should not show the old 30-minute timeout unless the setting/env explicitly lowers it.

#### Project rail: custom accent color only in idle state

Status: verified present

Expected behavior:
- A chosen project color appears as the same avatar ring style as the normal active blue ring.
- It appears only when the project is idle and not currently active.
- Active/open project, streaming, unread/completed, and error states override the custom color.

Files:
- `src/components/ProjectRail.tsx`
- `src/components/ProjectAvatar.tsx`
- `src/components/ProjectSettings.tsx`
- `src/styles/layout.css`

Fast code markers:
- `accentColor`
- `--project-accent`
- `.gg-rail-chip.has-project-accent:not(.is-active):not(.is-status-streaming):not(.is-status-unread):not(.is-status-interrupted)`

Manual check:
- Set project color in project settings.
- Leave the project idle and switch to another project.
- The avatar ring should use the custom color; work/error/active states should replace it.

#### Project Management label

Status: verified present

Expected behavior:
- The secondary left panel is called `Управление проектом`, not `Проекты`.
- The main project list remains `Мои проекты`.

Files:
- `src/i18n/ru.ts`
- `src/components/Sidebar.tsx`

Fast code markers:
- `project: 'Управление проектом'`
- `clients: 'Мои проекты'`

Manual check:
- Left project rail title should be `Мои проекты`.
- Adjacent project tools panel title should be `Управление проектом`.

## Quick Post-Update Checklist

- Settings -> Profiles is `Soon`, not a live profile manager.
- Project Management -> Browser and Design are `Soon`.
- Connectors secret fields have a flush-right eye button.
- Project settings Russian UI is readable and `npm run check:mojibake` passes.
- Grok Build model ids do not include `grok-composer-2.5-fast`.
- Chat copy blocks copy text through the button.
- Side file preview resolves project-relative paths.
- Help does not interrupt project work.
- Stop button stops only the current run.
- Project accent color ring appears only during idle, inactive state.
