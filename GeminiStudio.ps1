# Проверка, запущен ли Skills Office (порт 5555)
$port5555 = Get-NetTCPConnection -LocalPort 5555 -ErrorAction SilentlyContinue
if (!$port5555) {
    Start-Process python -ArgumentList "C:\Users\Pavel\skills-viewer\server.py" -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

# Запуск сервера Gemini Studio (порт 5556) из новой папки
$port5556 = Get-NetTCPConnection -LocalPort 5556 -ErrorAction SilentlyContinue
if ($port5556) {
    # Если запущен старый процесс, убиваем его
    Stop-Process -Id $port5556.OwningProcess -Force
    Start-Sleep -Seconds 1
}

Start-Process python -ArgumentList "C:\Users\Pavel\geminigrok\studio_server.py" -WindowStyle Hidden
Start-Sleep -Seconds 2

# Запуск Edge в режиме приложения
Start-Process "msedge.exe" -ArgumentList "--app=http://127.0.0.1:5556", "--new-window"
