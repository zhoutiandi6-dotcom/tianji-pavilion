@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-tianji.ps1"
if errorlevel 1 (
  echo.
  echo Startup check failed. See the error above.
)
pause
