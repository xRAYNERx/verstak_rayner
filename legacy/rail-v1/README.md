# Rail v1 — резервная копия (до редизайна 16.06.2026)

## Откат на v1

```powershell
cd C:\Users\RAYNER\verstak
Copy-Item legacy\rail-v1\ProjectRail.tsx src\components\ProjectRail.tsx -Force
# Удалить import rail.css из main.tsx, вернуть стили из layout-rail.css в layout.css
git checkout backup/rail-v1 -- src/components/ProjectRail.tsx
```

Или целиком ветка:

```powershell
git checkout backup/rail-v1
```

## Файлы

- `ProjectRail.tsx` — компонент rail v1
- `layout-rail.css` — стили rail из layout.css (строки ~91–1207)

Ветка git: `backup/rail-v1` @ коммит до редизайна.