@echo off
REM Xedu Client 完整打包脚本 (Windows)
REM 确保前后端都能正常工作

echo ==================================
echo Xedu Client 打包脚本
echo ==================================
echo.

REM 步骤1: 清理旧文件
echo [1/6] 清理旧的构建文件...
rmdir /s /q src\dist 2>nul
rmdir /s /q src-tauri\target\release 2>nul
echo ✓ 清理完成
echo.

REM 步骤2: 检查Python环境
echo [2/6] 检查Python环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo ✗ 未找到Python，请先安装Python
    exit /b 1
)
echo ✓ Python环境检查通过
echo.

REM 步骤3: 检查Rust环境
echo [3/6] 检查Rust环境...
cargo --version >nul 2>&1
if errorlevel 1 (
    echo ✗ 未找到Rust，请先安装Rust
    exit /b 1
)
echo ✓ Rust环境检查通过
echo.

REM 步骤4: 构建前端
echo [4/6] 构建前端资源...
call npm run build
if errorlevel 1 (
    echo ✗ 前端构建失败
    exit /b 1
)
echo ✓ 前端构建完成
echo.

REM 步骤5: 检查server.py
echo [5/6] 检查后端API文件...
if not exist "server.py" (
    echo ✗ 未找到 server.py
    exit /b 1
)
echo ✓ 后端API文件检查通过
echo.

REM 步骤6: 构建Tauri应用
echo [6/6] 构建Tauri应用...
call npm run tauri:build
if errorlevel 1 (
    echo ✗ Tauri构建失败
    exit /b 1
)
echo ✓ Tauri应用构建完成
echo.

echo ==================================
echo 构建成功！
echo ==================================
echo.
echo 构建输出:
echo   - 前端文件: src\dist\
echo   - Tauri应用: src-tauri\target\release\
echo.
echo 运行应用:
echo   src-tauri\target\release\app.exe
echo.
pause
