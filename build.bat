@echo off
REM Xedu Client Automated Build Script
REM Integrates environment setup, cleanup, and packaging

setlocal EnableDelayedExpansion

echo ========================================================
echo               Xedu Client Build System 2.0
echo ========================================================
echo.

REM --- Stage 1: Environment Preparation ---
echo [1/6] Checking Portable Python Environment...

set "PYTHON_ENV=python_env"
set "MARKER_FILE=%PYTHON_ENV%\.portable_ready"
set "SETUP_SCRIPT=scripts\setup_portable_python.py"

if exist "%MARKER_FILE%" (
    echo [INFO] Portable Python environment detected. Skipping setup.
) else (
    echo [WARN] Portable environment not found. Initializing...
    echo        This may take a few minutes...
    
    python --version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] System Python is required to run the setup script.
        echo         Please install Python or run %SETUP_SCRIPT% manually.
        exit /b 1
    )
    
    python "%SETUP_SCRIPT%"
    if errorlevel 1 (
        echo [ERROR] Python environment initialization failed.
        exit /b 1
    )
    
    if not exist "%MARKER_FILE%" (
        echo [ERROR] Setup script finished but marker file missing.
        exit /b 1
    )
    echo [SUCCESS] Portable environment initialized.
)
echo.

REM --- Stage 2: Cleanup ---
echo [2/6] Cleaning up...

if exist "dist" rmdir /s /q "dist"
if exist "dist-installer" rmdir /s /q "dist-installer"

echo        - Removing __pycache__...
for /d /r . %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d"

echo [SUCCESS] Cleanup complete.
echo.

REM --- Stage 3: Environment Check ---
echo [3/6] Verifying Node.js...
call node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    exit /b 1
)
echo [OK] Node.js found.
echo.

REM --- Stage 4: Frontend Build ---
echo [4/6] Building Frontend (Vite)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed.
    exit /b 1
)
echo [SUCCESS] Frontend build complete.
echo.

REM --- Stage 5: Electron Build ---
echo [5/6] Building Electron App...
call npm run electron:build
if errorlevel 1 (
    echo [ERROR] Electron build failed.
    exit /b 1
)
echo [SUCCESS] Build complete.
echo.

REM --- Stage 6: Finish ---
echo ========================================================
echo                    BUILD SUCCESSFUL
echo ========================================================
echo.
echo Output directory: %CD%\dist-installer
echo.
