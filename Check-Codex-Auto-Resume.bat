@echo off
setlocal
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"
title Codex Auto Resume - Doctor
node "%PROJECT_DIR%\codex-supervisor.js" --project "%PROJECT_DIR%" --doctor
set "EC=%ERRORLEVEL%"
echo.
echo Doctor finished with exit code %EC%.
pause
exit /b %EC%
