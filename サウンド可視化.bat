@echo off
chcp 65001 > nul
title Wavelet (dev)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo [error] Node.js not found in PATH.
    echo Please install Node.js LTS from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

call node "scripts\launcher-banner.mjs" banner

if not exist "node_modules" (
    call node "scripts\launcher-banner.mjs" install-start
    call npm install
    if errorlevel 1 (
        call node "scripts\launcher-banner.mjs" install-fail
        pause
        exit /b 1
    )
)

REM Electron postinstall sometimes fails silently and leaves the binary
REM missing. electron-vite then dies with "Error: Electron uninstall".
REM Self-heal by re-running electron's install script.
if not exist "node_modules\electron\dist\electron.exe" (
    echo.
    echo [self-heal] electron binary missing, re-downloading...
    call node "node_modules\electron\install.js"
    if errorlevel 1 (
        echo [error] electron install.js failed. Check your network and try again.
        pause
        exit /b 1
    )
)

call npm run dev
set DEV_EXIT=%errorlevel%
echo.
echo --------------------------------------------------
if %DEV_EXIT% NEQ 0 (
    echo [error] npm run dev exited with code %DEV_EXIT%
    echo Scroll up to see the error log.
) else (
    echo Wavelet dev server stopped.
)
echo --------------------------------------------------
echo Press any key to close this window...
pause >nul
exit /b %DEV_EXIT%
