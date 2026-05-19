@echo off
chcp 65001 >nul
title GeminiGrok
cd /d C:\Users\Pavel\geminigrok
echo Starting GeminiGrok...
echo.
echo Keep this window open while using the app.
echo Close it (or press Ctrl+C) to quit.
echo.
npm run dev
pause
