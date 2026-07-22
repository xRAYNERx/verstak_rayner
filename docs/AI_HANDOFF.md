# AI Handoff: Verstak 2.0.11 selected model and Wordstat first-run fixes

Last updated: 2026-07-22
Source branch: `codex/reapply-2.0.11`
Target use: pull Rayner's local fixes from the fork into Pavel's main Verstak repository
Local version alignment: `2.0.11`

## Read This First

This push package contains two hotfixes on top of the existing 2.0.11 recovery branch:

- chat sends and work-progress labels now use the user's currently selected provider/model instead of stale saved chat-session model ids
- Wordstat keyword-collection tasks now get the right connector/skill context on the first message, including prompts like "собери ключи" that do not literally mention "вордстат"

Do not include the untracked `mcps/chrome-devtools/` folder or `scripts/wordstat-connector-live.mjs` unless Pavel explicitly asks for that local tooling/probe.

Before transferring, read:

- `docs/VERSTAK_CHANGELOG_TRACKER.md`
- `docs/RESTORE_AFTER_UPSTREAM_UPDATE.md`
- `docs/DEVELOPER_PUSH_LOG.md`
- `docs/PATCHNOTES_DRAFT.md`

## What Changed

### Selected model routing and progress labels

Main files:

- `shared/contracts/provider.ts`
- `src/components/Chat.tsx`
- `src/hooks/useProvider.ts`
- `electron/ipc/ai.ts`
- `electron/ai/runner-progress.ts`
- `electron/preload.ts`
- `src/types/api.d.ts`
- `tests/lib/model-selection.test.ts`
- `tests/ai/runner-progress.test.ts`

Important behavior:

- Shared provider helpers normalize selected models and strip stale Grok ids: `grok-composer-2.5-fast`, `grok-composer-2.5`, `grok-build`.
- `Chat` sends `selectedProviderId` / `selectedModel` for normal sends, help sends, retries, queued sends, and resumes.
- Backend AI IPC treats explicit route/model overrides as highest priority, then resume data, then selected UI model, then stored provider default.
- Smart routing must not override a user-selected model when `selectedModel` is present.
- Work-progress labels use the normalized provider/model pair and must not display stale composer ids.

Verify:

- Select a non-default model, send a chat request, and confirm the run uses that selected model.
- Open a chat that previously stored `grok-composer-2.5-fast`; confirm `Ход работы` repairs to the current Grok Build model and does not show composer.
- Run `tests/lib/model-selection.test.ts` and `tests/ai/runner-progress.test.ts`.

### Wordstat first-message availability

Main files:

- `src/lib/skill-suggest.ts`
- `electron/ai/runner-util.ts`
- `electron/ai/tools.ts`
- `tests/lib/skill-suggest.test.ts`
- `tests/ai/tools-allow.test.ts`

Important behavior:

- Skill suggestion now treats "сбор/подбор/найти/подготовить ключи/ключевые фразы" as explicit Wordstat intent even without the word "вордстат".
- The score is high enough to pass the chat auto-bound skill threshold, so Wordstat context is available on the first user message.
- Generic "расширить семантическое" still prefers `direct-semantics`; do not make broad semantics prompts auto-bind Wordstat unless there is keyword collection or frequency/Wordstat intent.
- `tools_allow` pseudo names such as `yandex_wordstat`, `ywordstat`, `files`, and connector ids are fail-open. This avoids a partial allow-list that leaves only `connector_query` and causes the model to claim Wordstat is unavailable.
- The `connector_query` description explicitly allows direct `id="yandex_wordstat"` calls; `list_connectors` is optional and must not be treated as a gate.

Verify:

- In chat, type "Собери ключи для рекламной кампании ..." and confirm Wordstat is suggested/auto-bound on the first send.
- The assistant must try `connector_query` with `id="yandex_wordstat"` before saying Wordstat is unavailable.
- Run `tests/lib/skill-suggest.test.ts` and `tests/ai/tools-allow.test.ts`.

## Validation Run Locally

- `npm.cmd run check:mojibake`
- `npm.cmd run test:fast -- tests\lib\skill-suggest.test.ts tests\ai\tools-allow.test.ts tests\lib\model-selection.test.ts tests\ai\runner-progress.test.ts`
- `npm.cmd run build`
- `git diff --check`

Known local validation note:

- `npm.cmd run type` currently fails because several existing component tests cannot resolve `@testing-library/react` type/module declarations. This is outside the hotfix diff; do not treat it as a selected-model or Wordstat regression.

## Transfer Notes For Pavel's AI

- Preserve the current installed/local version alignment at `2.0.11` unless Pavel is intentionally releasing a newer version.
- Do not reintroduce old Grok IDs such as `grok-composer-2.5-fast` or `grok-build`.
- Preserve explicit selected-model routing; do not let smart routing silently replace `selectedModel`.
- Preserve Wordstat keyword-collection intent for prompts that say "собери ключи" without saying "вордстат".
- Preserve fail-open behavior for connector pseudo names in `tools_allow`.
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
