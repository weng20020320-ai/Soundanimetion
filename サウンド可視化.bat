@echo off
chcp 65001 > nul
title Audio Visualizer (dev)
cd /d "%~dp0"

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

call npm run dev
