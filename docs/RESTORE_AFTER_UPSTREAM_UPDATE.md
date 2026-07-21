# Restore After Pavel Upstream Update

Use this checklist whenever Rayner installs a new Pavel build and asks to restore local Verstak improvements.

## Rule

Do not start from memory.
Do not scan the whole repository first.
Start from `docs/VERSTAK_CHANGELOG_TRACKER.md`.

## Workflow

1. Check installed version from:
   `C:\Users\RAYNER\AppData\Local\Programs\Verstak\resources\app.asar`
2. Check local `package.json` version.
3. Keep local metadata aligned with installed version before build/deploy.
4. Open `docs/VERSTAK_CHANGELOG_TRACKER.md`.
5. For every tracker item:
   - check the listed fast code markers;
   - if the item is missing, restore it in the listed files;
   - if it is present, leave it alone;
   - if upstream intentionally changed the same feature, keep Rayner's accepted final behavior unless Rayner says otherwise.
6. Add every restored or newly verified final behavior back to the tracker.
7. Run validation.
8. Deploy locally unless Rayner explicitly says not to.

## First Things To Check

- Settings -> Profiles must be closed as `Soon`.
- Project Management -> Browser and Design must be closed as `Soon`.
- Connector secret fields must have a flush-right eye button.
- Project settings must not show broken Russian text.
- Grok Build must not use removed model ids such as `grok-composer-2.5-fast`.
- Chat copy blocks must copy through the button.
- Side file preview must resolve project-relative paths.
- Help must not interrupt active project work.
- Stop must target only the current run.
- Project accent color ring must be overridden by active/work/error states.

## Required Validation

Run at least:

- `npm.cmd run check:mojibake`
- `npm.cmd run build`
- `git diff --check`

If renderer or CSS changed and Rayner did not forbid deploy:

- `npx.cmd electron-builder --win --x64`
- `npm.cmd run deploy:local`
- verify installed `app.asar` contains the expected code/CSS markers

## Push/Handoff Rule

When Rayner says to push:

1. Use the `verstak-git-push-handoff` skill.
2. Update `docs/AI_HANDOFF.md`.
3. Update `docs/PATCHNOTES_DRAFT.md`.
4. Update `docs/DEVELOPER_PUSH_LOG.md`.
5. Keep patch notes human-readable:
   - describe what changed for the user;
   - do not include internal implementation details;
   - do not mention this tracker/design guide as a product feature;
   - do not explain why something was changed unless the user-facing result needs it.

## Note For Pavel's AI

Read `docs/VERSTAK_CHANGELOG_TRACKER.md` before transferring Rayner's fork changes.
It lists the accepted local product decisions, files to inspect, and fast markers.
Do not rely on upstream history alone, because some upstream commits intentionally differ from Rayner's accepted local behavior.
