@echo off
title Jupyter Lab Client - Launcher
color 0A

echo =============================================
echo  Jupyter Lab Client - 启动器
echo =============================================
echo.
echo 正在准备启动环境...
echo.

REM 获取当前目录
set CURRENT_DIR=%~dp0
set RESOURCES_DIR=%CURRENT_DIR%resources
set PYTHON_EXE=%RESOURCES_DIR%\venv\Scripts\python.exe
set WEB_APP=%RESOURCES_DIR%\web_app.py

REM 检查Python是否存在
if not exist "%PYTHON_EXE%" (
    echo [错误] 找不到Python解释器: %PYTHON_EXE%
    echo 请确保venv目录已正确安装
    pause
    exit /b 1
)

REM 检查web_app.py是否存在
if not exist "%WEB_APP%" (
    echo [错误] 找不到web_app.py: %WEB_APP%
    pause
    exit /b 1
)

echo [步骤1/3] 检查文件... OK
echo.

REM 启动Flask API
echo [步骤2/3] 正在启动Jupyter Lab API服务器...
echo    端口: 5000
echo    Python: %PYTHON_EXE%
echo.
start "Jupyter API Server" /min cmd /c "%PYTHON_EXE% %WEB_APP%"

REM 等待API启动
timeout /t 3 /nobreak >nul

echo [步骤3/3] 正在启动应用界面...
echo.

REM 启动Tauri应用
set TAURI_APP=%CURRENT_DIR%Jupyter-Lab-Client.exe
if exist "%TAURI_APP%" (
    start "" "%TAURI_APP%"
    echo ✅ Jupyter Lab Client 已启动
) else (
    echo [错误] 找不到Tauri应用: %TAURI_APP%
    echo 请先运行: npm run tauri:build
    pause
    exit /b 1
)

echo.
echo =============================================
echo ✅ 启动完成！
echo =============================================
echo.
echo 📍 Jupyter Lab Client 运行在应用窗口中
echo 🌐 API 服务器运行在: http://127.0.0.1:5000
echo 📓 Jupyter Lab 运行在: http://127.0.0.1:8888/lab
echo.
echo 💡 提示：
echo    - 关闭应用窗口会同时关闭Jupyter Lab
echo    - 如需停止服务，请关闭此命令行窗口
echo.

pause
