@echo off
setlocal
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "STATUS=%PROJECT_DIR%\.codex-auto-resume\status.html"
if exist "%STATUS%" (
  start "" "%STATUS%"
) else (
  echo Status page does not exist yet. Start the supervisor once first.
  pause
)
