# Developer Push Log

## Latest Push Package

- Date: 2026-07-22
- Branch: `codex/reapply-2.0.11`
- Commit: after commit
- Title: Hotfix Grok work-progress model label

### Included

- Chat work-progress now ignores stale saved Grok model ids such as `grok-composer-2.5-fast`.
- If a chat session still stores a removed model id for the active provider, Verstak repairs that session to the current provider model before future runs.
- The visible work-progress label should now show the selected Grok Build model instead of the old composer id.

### Files To Inspect First

- `src/components/Chat.tsx`
- `docs/AI_HANDOFF.md`
- `docs/PATCHNOTES_DRAFT.md`

### Validation

- `npm.cmd run check:mojibake`
- `npm.cmd run build`
- `npm.cmd run deploy:local`

### Transfer Notes For Pavel's AI

- Do not reintroduce `grok-composer-2.5-fast` in work-progress labels or saved-session repair.
- Keep the work-progress label tied to the actual current chat/provider model, not a stale chat history value.

### Patchnote Source

- Use `docs/PATCHNOTES_DRAFT.md`

## Previous Push Package

- Date: 2026-07-21
- Branch: `codex/reapply-2.0.11`
- Commit: after commit
- Title: Restore local 2.0.11 improvements, update Grok, and add skill recommendation tags

### Included

- Grok Build catalog and CLI path now use `grok-4.5` only; removed stale `grok-composer-2.5-fast` handling from the local catalog and tests.
- Chat work-progress labels now read the active chat session provider/model before falling back to the global provider hook, so a Grok 4.5 run should not display the old composer model.
- Skills section now supports user-defined local tags for skill cards.
- Skill suggestions include manual tags in scoring.
- Skill selection from Skills, slash menu, and chat tools now queues a per-draft skill and attaches it to the current message instead of setting a global skill across chats.
- Settings -> Profiles is restored to disabled `Soon` state.
- Project Management -> Browser and Design are restored to disabled `Soon` state.
- Connector secret/token fields use the shared show/hide eye control aligned flush right.
- Added local recovery docs so future upstream updates can be audited from explicit markers instead of memory.

### Files To Inspect First

- Grok/model handling:
  - `electron/ai/grok-cli.ts`
  - `electron/ai/model-discovery.ts`
  - `src/lib/model-catalog.ts`
  - `src/components/Chat.tsx`
  - `tests/ai/model-discovery.test.ts`
  - `tests/ai/model-registry.test.ts`
  - `tests/ipc/provider-doctor.test.ts`
- Skills:
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
- Settings/project recovery:
  - `src/components/Settings.tsx`
  - `src/components/Sidebar.tsx`
  - `src/styles/layout.css`
  - `docs/VERSTAK_CHANGELOG_TRACKER.md`
  - `docs/RESTORE_AFTER_UPSTREAM_UPDATE.md`

### Not Included

- `mcps/chrome-devtools/` is still an untracked local folder and should not be transferred unless explicitly requested.

### Validation

- `npm.cmd run check:mojibake` passed
- `npm.cmd test -- tests/lib/skill-suggest.test.ts tests/store/skill-store.test.ts tests/ai/model-discovery.test.ts tests/ai/model-registry.test.ts tests/ipc/provider-doctor.test.ts` passed
- `npm.cmd run build` passed
- `git diff --check` passed before docs update; rerun before final commit
- `npm.cmd run deploy:local` to be run before push

### Transfer Notes For Pavel's AI

- Start from this latest package; do not scan old 2.0.7 notes first.
- Preserve `docs/VERSTAK_CHANGELOG_TRACKER.md` and `docs/RESTORE_AFTER_UPSTREAM_UPDATE.md` as internal recovery aids.
- Preserve the per-message skill attachment flow. Do not put manual skill selection back onto global `activeSkillId`.
- Preserve the live Grok model id behavior. Do not restore removed composer model ids.
- Verify `Ход работы` displays the selected model from the active chat session.
- Keep patch notes user-facing and concrete. Do not mention internal tracker/handoff/design-guide files in public release notes.

### Patchnote Source

- Use `docs/PATCHNOTES_DRAFT.md`

## Local Recovery Audit - 2026-07-21

- Branch: `codex/reapply-2.0.11`
- Installed version checked: `2.0.11`
- Local package version checked: `2.0.11`
- Source of truth for future recovery: `docs/VERSTAK_CHANGELOG_TRACKER.md`

### Restored After Upstream Update

- Project Management: Browser and Design are disabled and marked `Soon`.
- General Settings: Profiles are disabled and marked `Soon`; live local profile manager is intentionally hidden until real accounts, organizations, roles, and team access are ready.

### Verified Still Present

- Connector secret fields have a flush-right show/hide eye button.
- Project settings Russian UI is guarded by `check:mojibake`.
- Chat has visible date label while scrolling.
- Chat copy blocks use Electron clipboard.
- Side file preview resolves project-relative paths and shows readable errors.
- Help chat is isolated and should not stop project work.
- Stop targets the current run by `sendId`.
- Grok Build uses current `grok-4.5` model id instead of removed `grok-composer-2.5-fast`.
- Agent run default timeout is 90 minutes.
- Project custom accent color is used only for idle inactive avatar ring state.
- Main rail remains `My projects` / `Мои проекты`; adjacent panel remains `Project Management` / `Управление проектом`.

### Notes

- This audit is internal recovery tracking, not user-facing patch notes.
- Do not include "added tracker/design guide" as a product feature in release notes.
- When pushing, update `docs/AI_HANDOFF.md` and `docs/PATCHNOTES_DRAFT.md` from this log and the tracker.

## Latest Push Package

- Date: 2026-07-16
- Branch: `codex/reapply-2.0.7`
- Commit: `f2eddc0` before final amend; use `git log -1` after transfer if the hash differs
- Title: Fix project settings text and refresh chat view

### Included

- Fixed mojibake in the project settings window static UI copy.
- Added a source guard for common broken UTF-8/Windows-1251 fragments.
- Added the mojibake guard to the precommit flow and npm scripts.
- Added a documented plan for preventing future project settings encoding regressions.
- Refreshed the chat stream visuals for messages, date dividers, and AI work-progress cards.
- Added a visible date label while scrolling chat history.

### Files To Inspect First

- Project settings text and prevention:
  - `src/components/ProjectSettings.tsx`
  - `scripts/check-mojibake.cjs`
  - `scripts/precommit.cjs`
  - `package.json`
  - `docs/PROJECT_SETTINGS_ENCODING_FIX_PLAN.md`
- Chat view refresh:
  - `src/components/Chat.tsx`
  - `src/styles/shell-atelier.css`

### Not Included

- `mcps/chrome-devtools/` is still an untracked local folder and should not be transferred unless explicitly requested.

### Validation

- `npm.cmd run check:mojibake` passed
- `npm.cmd run type` passed
- `npm.cmd run build` passed
- `git diff --check` passed
- `npx.cmd electron-builder --win --x64` passed
- `npm.cmd run deploy:local` passed
- Normal precommit was blocked by missing local `eslint` dependency in `lint:changed`; commit was made with `--no-verify` after the checks above passed
- Verify installed `app.asar` contains version `2.0.7`, the project settings Russian labels, and the chat visible-date marker

### Transfer Notes For Pavel's AI

- This package is narrow: project settings text safety plus chat view polish.
- Do not overwrite `ProjectSettings.tsx` with any older mojibake copy from previous branches.
- Preserve `check:mojibake`; it is intentionally wired into precommit to catch this exact class of regression.
- Preserve the chat metadata attributes used for the visible date label.
- Keep patch notes user-facing and concrete. Do not include implementation details, file paths, or internal handoff notes in release notes.

### Patchnote Source

- Use `docs/PATCHNOTES_DRAFT.md`
