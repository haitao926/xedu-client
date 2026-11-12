@echo off
setlocal
cd /d "%~dp0"
call npm run build:installer:win
exit /b %errorlevel%
