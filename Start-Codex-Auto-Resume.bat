@echo off
setlocal
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"
title Codex Auto Resume - Supervisor

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found. Codex CLI normally requires Node.js.
  pause
  exit /b 10
)

where codex >nul 2>nul
if errorlevel 1 (
  echo ERROR: Codex CLI was not found in PATH.
  pause
  exit /b 11
)

node "%PROJECT_DIR%\codex-supervisor.js" --project "%PROJECT_DIR%"
set "EC=%ERRORLEVEL%"

echo.
echo Supervisor finished with exit code %EC%.
echo Status and logs are in: %PROJECT_DIR%\.codex-auto-resume\
echo You may close this window.
pause
exit /b %EC%
