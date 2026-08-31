@echo off
setlocal
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "STATE_DIR=%PROJECT_DIR%\.codex-auto-resume"
if not exist "%STATE_DIR%" mkdir "%STATE_DIR%" >nul 2>nul
> "%STATE_DIR%\STOP_REQUESTED.flag" echo stop requested at %date% %time%
echo Safe stop requested.
echo The supervisor will preserve the saved Codex Thread ID. If Codex is active, it will stop after the current turn finishes.
timeout /t 2 /nobreak >nul
if exist "%STATE_DIR%\status.html" start "" "%STATE_DIR%\status.html"
exit /b 0
