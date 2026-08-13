#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  Barangay AI — start Ollama so the browser can reach it. (macOS/Linux)
#
#  Run with:  ./start-ollama.sh      (once:  chmod +x start-ollama.sh)
#
#  It does the two things the app needs, in the right order:
#    1. frees port 11434 if a stale Ollama is already holding it
#    2. starts the server with OLLAMA_ORIGINS=* so the browser is
#       allowed to talk to it (without this you get a CORS error)
#
#  Tired of running this? Make it permanent instead — see README
#  "Skip this step forever".
# ─────────────────────────────────────────────────────────────────────
set -u

if ! command -v ollama >/dev/null 2>&1; then
  echo
  echo "  Ollama is not installed, or not on your PATH."
  echo "  Get it free at https://ollama.com then run this again."
  echo
  exit 1
fi

echo
echo "  [1/2] Stopping any Ollama that is already running..."
pkill -f 'ollama serve' 2>/dev/null || true
pkill -x ollama 2>/dev/null || true

# Give the OS a moment to actually release port 11434 before rebinding.
sleep 2

echo "  [2/2] Starting Ollama with browser access enabled..."
echo
echo "  Leave this terminal OPEN while you use the app."
echo "  Press Ctrl+C to stop the server."
echo

export OLLAMA_ORIGINS="*"
exec ollama serve
