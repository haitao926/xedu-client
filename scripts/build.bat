@echo off
REM Xedu Client 完整打包脚本 (Windows)
REM Electron + Python Backend

echo ==================================
echo Xedu Client 打包脚本
echo ==================================
echo.

REM 步骤1: 清理旧文件
echo [1/5] 清理旧的构建文件...
rmdir /s /q build 2>nul
rmdir /s /q dist-installer 2>nul
echo ✓ 清理完成
echo.

REM 步骤2: 检查Python环境
echo [2/5] 检查Python环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo ✗ 未找到Python，请先安装Python
    exit /b 1
)
echo ✓ Python环境检查通过
echo.

REM 步骤3: 检查Node.js环境
echo [3/5] 检查Node.js环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo ✗ 未找到Node.js，请先安装Node.js
    exit /b 1
)
echo ✓ Node.js环境检查通过
echo.

REM 步骤4: 构建前端
echo [4/5] 构建前端资源...
call npm run build
if errorlevel 1 (
    echo ✗ 前端构建失败
    exit /b 1
)
echo ✓ 前端构建完成
echo.

REM 步骤5: 构建Electron应用
echo [5/5] 构建Electron应用...
call npm run electron:build
if errorlevel 1 (
    echo ✗ Electron构建失败
    exit /b 1
)
echo ✓ Electron应用构建完成
echo.

echo ==================================
echo 构建成功！
echo ==================================
echo.
echo 构建输出:
echo   - 前端文件: build\
echo   - Electron应用: dist-installer\
echo.
pause
