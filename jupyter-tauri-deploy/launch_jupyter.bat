@echo off
title Jupyter Lab Client

echo ============================================================
echo  Jupyter Lab Client 启动器
echo ============================================================
echo.
echo 正在启动 Jupyter Lab Client...
echo.

:: Change to the directory where this script is located
cd /d "%~dp0"

:: Launch the application
start "" "app.exe"

echo.
echo 应用已启动！
echo Jupyter Lab 将在浏览器中打开: http://127.0.0.1:8888/lab
echo.
pause
