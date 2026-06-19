# Rayner — rebase на upstream (завершено 19.06.2026)

## Итог

| Поле | Значение |
|------|----------|
| База | `origin/main` @ `cd80c66` (1.5.14 + merge filatov/main) |
| Накатано поверх | `fe92bc0` таймер, `3c20b0a` code blocks |
| Установлено | `%LOCALAPPDATA%\Programs\Verstak` @ `3c20b0a` |
| Backup (до rebase) | `backup/rayner-2026-06-18` @ `9d7d34d` |

Павел уже вмержил в upstream: справка `?`, черновики, сайдбар, updater, чаты ПКМ и др.  
Осталось только 2 коммита Rayner — они cherry-pick'нуты.

## Push в форк (когда RAYNER скажет)

```powershell
git push rayner main
```