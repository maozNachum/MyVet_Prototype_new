@echo off
setlocal
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"
node "%PROJECT_DIR%\codex-supervisor.js" --project "%PROJECT_DIR%" --self-test
set "EC=%ERRORLEVEL%"
echo.
pause
exit /b %EC%
