@echo off
REM ============================================================
REM  Wavelet - Package Release launcher.
REM
REM  IMPORTANT: This .bat MUST stay 100% ASCII.
REM  Japanese Windows cmd.exe parses .bat as CP932; any non-ASCII
REM  byte (Chinese / Japanese) will corrupt tokenization and may
REM  cause cmd to fall through to Windows shell file-association
REM  for the next path it sees (e.g. ".mjs" -> "open with..."
REM  dialog). All Chinese output is delegated to release-banner.mjs.
REM ============================================================

chcp 65001 > nul
title Wavelet - Package Release
cd /d "%~dp0"

call node "scripts\release-banner.mjs" pre
if errorlevel 1 call node "scripts\release-banner.mjs" banner-fail-warn

echo.
call node "scripts\release-banner.mjs" confirm
pause > nul

call npm run package:win
set BUILD_EXIT=%errorlevel%

if not "%BUILD_EXIT%"=="0" (
    call node "scripts\release-banner.mjs" fail %BUILD_EXIT%
    pause
    exit /b %BUILD_EXIT%
)

call node "scripts\release-banner.mjs" post

call node "scripts\release-banner.mjs" bye
pause > nul
exit /b 0
