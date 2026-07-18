@echo off
REM Xedu Client Automated Build Script
REM Integrates environment setup, cleanup, and packaging

setlocal EnableDelayedExpansion

echo ========================================================
echo               Xedu Client Build System 2.0
echo ========================================================
echo.

REM --- Stage 1: Cleanup ---
echo [1/4] Cleaning up...

if exist "dist" rmdir /s /q "dist"
if exist "dist-installer" rmdir /s /q "dist-installer"
if exist "dist-final" rmdir /s /q "dist-final"

echo        - Removing __pycache__...
for /d /r . %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d"

echo [SUCCESS] Cleanup complete.
echo.

REM --- Stage 2: Environment Check ---
echo [2/4] Verifying Node.js...
call node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    exit /b 1
)
echo [OK] Node.js found.
echo.

REM --- Stage 3: Scratch Editor Build ---
echo [3/4] Building Scratch Editor...
call npm run build:scratch
if errorlevel 1 (
    echo [ERROR] Scratch editor build failed.
    exit /b 1
)
echo [SUCCESS] Scratch editor build complete.
call npm run check:scratch-build
if errorlevel 1 (
    echo [ERROR] Scratch editor artifact check failed.
    exit /b 1
)
echo.

REM --- Stage 4: Frontend and Electron Build ---
echo [4/4] Building Frontend (Vite)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed.
    exit /b 1
)
echo [SUCCESS] Frontend build complete.
echo.

echo [INFO] Building Electron App...
call npx electron-builder
if errorlevel 1 (
    echo [ERROR] Electron build failed.
    exit /b 1
)
echo [SUCCESS] Build complete.
echo.

REM --- Finish ---
echo ========================================================
echo                    BUILD SUCCESSFUL
echo ========================================================
echo.
echo Output directory: %CD%\dist-final
echo.
