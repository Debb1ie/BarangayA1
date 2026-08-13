@echo off
REM ─────────────────────────────────────────────────────────────────────
REM  Barangay AI — start Ollama so the browser can reach it.
REM
REM  Double-click this file, or run it from a terminal. It does the two
REM  things the app needs, in the right order:
REM    1. frees port 11434 if a stale Ollama is already holding it
REM    2. starts the server with OLLAMA_ORIGINS=* so the browser is
REM       allowed to talk to it (without this you get a CORS error)
REM
REM  Tired of running this? Make it permanent instead — see README
REM  "Skip this step forever".
REM ─────────────────────────────────────────────────────────────────────

title Barangay AI - Ollama

where ollama >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Ollama is not installed, or not on your PATH.
  echo   Get it free at https://ollama.com then run this again.
  echo.
  pause
  exit /b 1
)

echo.
echo   [1/2] Stopping any Ollama that is already running...
taskkill /F /IM "ollama.exe" >nul 2>&1
taskkill /F /IM "ollama app.exe" >nul 2>&1

REM Give Windows a moment to actually release port 11434 before rebinding.
timeout /t 2 /nobreak >nul

echo   [2/2] Starting Ollama with browser access enabled...
echo.
echo   Leave this window OPEN while you use the app.
echo   Press Ctrl+C to stop the server.
echo.

set "OLLAMA_ORIGINS=*"
ollama serve

REM Only reached if the server exits — keep the window up so the user can
REM read the error instead of watching it flash closed.
echo.
echo   Ollama stopped. Read any message above, then close this window.
pause
