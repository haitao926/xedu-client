#!/usr/bin/env python3
"""
创建Tauri应用和Python Flask API的启动器
"""

import os
import sys
import shutil
from pathlib import Path

def create_launcher_bat():
    """创建Windows启动器批处理文件"""
    bat_content = '''@echo off
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
set PYTHON_EXE=%RESOURCES_DIR%\\venv\\Scripts\\python.exe
set WEB_APP=%RESOURCES_DIR%\\web_app.py

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
'''
    with open("launch_jupyter.bat", "w", encoding="gbk") as f:
        f.write(bat_content)
    print("✅ 创建了 launch_jupyter.bat")

def create_launcher_sh():
    """创建Linux/Mac启动器shell脚本"""
    sh_content = '''#!/bin/bash

echo "============================================="
echo " Jupyter Lab Client - 启动器"
echo "============================================="
echo ""
echo "正在准备启动环境..."
echo ""

# 获取当前目录
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESOURCES_DIR="$CURRENT_DIR/resources"
PYTHON_EXE="$RESOURCES_DIR/venv/Scripts/python.exe"
WEB_APP="$RESOURCES_DIR/web_app.py"

# 检查Python是否存在
if [ ! -f "$PYTHON_EXE" ]; then
    echo "[错误] 找不到Python解释器: $PYTHON_EXE"
    echo "请确保venv目录已正确安装"
    read -p "按回车键退出..."
    exit 1
fi

# 检查web_app.py是否存在
if [ ! -f "$WEB_APP" ]; then
    echo "[错误] 找不到web_app.py: $WEB_APP"
    read -p "按回车键退出..."
    exit 1
fi

echo "[步骤1/3] 检查文件... OK"
echo ""

# 启动Flask API
echo "[步骤2/3] 正在启动Jupyter Lab API服务器..."
echo "   端口: 5000"
echo "   Python: $PYTHON_EXE"
echo ""

"$PYTHON_EXE" "$WEB_APP" &
PYTHON_PID=$!

# 等待API启动
sleep 3

echo "[步骤3/3] 正在启动应用界面..."
echo ""

# 启动Tauri应用
TAURI_APP="$CURRENT_DIR/Jupyter Lab Client"
if [ -f "$TAURI_APP" ]; then
    "$TAURI_APP" &
    echo "✅ Jupyter Lab Client 已启动"
else
    echo "[错误] 找不到Tauri应用: $TAURI_APP"
    echo "请先运行: npm run tauri:build"
    read -p "按回车键退出..."
    kill $PYTHON_PID 2>/dev/null
    exit 1
fi

echo ""
echo "============================================="
echo "✅ 启动完成！"
echo "============================================="
echo ""
echo "📍 Jupyter Lab Client 运行在应用窗口中"
echo "🌐 API 服务器运行在: http://127.0.0.1:5000"
echo "📓 Jupyter Lab 运行在: http://127.0.0.1:8888/lab"
echo ""
echo "💡 提示："
echo "   - 关闭应用窗口会同时关闭Jupyter Lab"
echo "   - 如需停止服务，请使用 Ctrl+C"
echo ""

# 等待用户中断
trap "kill $PYTHON_PID 2>/dev/null; exit" INT
wait
'''
    with open("launch_jupyter.sh", "w", encoding="utf-8") as f:
        f.write(sh_content)
    os.chmod("launch_jupyter.sh", 0o755)
    print("✅ 创建了 launch_jupyter.sh")

def create_readme():
    """创建README文件"""
    readme_content = '''# Jupyter Lab Client

## 快速启动

### Windows
1. 双击 `launch_jupyter.bat`
2. 等待应用启动

### Linux/Mac
1. 运行: `./launch_jupyter.sh`
2. 等待应用启动

## 手动启动

如果启动器无法正常工作，请按以下步骤手动启动：

### 1. 启动Flask API
```bash
resources/venv/Scripts/python.exe resources/web_app.py
```

### 2. 启动Tauri应用
```bash
Jupyter-Lab-Client.exe
```

## 访问地址

- **应用界面**: 通过Tauri应用窗口
- **API服务器**: http://127.0.0.1:5000
- **Jupyter Lab**: http://127.0.0.1:8888/lab

## 停止服务

关闭应用窗口即可停止所有服务。

## 构建说明

要重新构建应用，请运行：
```bash
npm run tauri:build
```

构建完成后，exe文件会生成在 `src-tauri/target/release/bundle/` 目录中。

启动器和资源文件需要手动复制到exe所在目录。
'''
    with open("README_LAUNCHER.md", "w", encoding="utf-8") as f:
        f.write(readme_content)
    print("✅ 创建了 README_LAUNCHER.md")

def main():
    print("=" * 60)
    print("📦 创建Tauri启动器")
    print("=" * 60)
    print()

    # 检查是否存在resources目录
    if not Path("src-tauri/resources").exists():
        print("❌ 错误: src-tauri/resources 目录不存在")
        print("   请先运行: python setup_tauri_bundle.py")
        return 1

    print("📁 创建启动器文件...")
    create_launcher_bat()
    create_launcher_sh()
    create_readme()

    print()
    print("=" * 60)
    print("✅ 启动器创建完成!")
    print("=" * 60)
    print()
    print("📝 下一步:")
    print("   1. 运行: npm run tauri:build")
    print("   2. 将启动器文件复制到exe目录:")
    print("      - launch_jupyter.bat")
    print("      - launch_jupyter.sh")
    print("      - README_LAUNCHER.md")
    print("   3. 将 src-tauri/resources 目录复制到exe目录")
    print()
    print("💡 提示: 构建完成后，exe在:")
    print("   src-tauri/target/release/bundle/msi/ 或 bundle/dmg/ 等")

    return 0

if __name__ == "__main__":
    sys.exit(main())
