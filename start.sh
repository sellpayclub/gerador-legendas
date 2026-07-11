#!/bin/bash
# Inicia backend + frontend do Legendas Locais
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/opt/ffmpeg-full/bin:$PATH"

echo "==> Parando instâncias antigas..."
launchctl unload "$HOME/Library/LaunchAgents/com.legendas.frontend.plist" 2>/dev/null || true
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 2

echo "==> Backend (porta 8000)..."
cd "$ROOT/backend"
source .venv/bin/activate
.venv/bin/python -m uvicorn main:app --port 8000 --host 127.0.0.1 &
BACKEND_PID=$!
sleep 3

if ! curl -sf http://127.0.0.1:8000/api/health >/dev/null; then
  echo "ERRO: backend não subiu. Verifique backend/.env e ffmpeg-full."
  exit 1
fi
echo "    Backend OK (PID $BACKEND_PID)"

echo "==> Frontend (porta 3000)..."
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!
sleep 5

echo ""
echo "============================================"
echo "  Pronto! Abra: http://localhost:3000"
echo "  Backend:    http://localhost:8000"
echo "  Para parar: kill $BACKEND_PID $FRONTEND_PID"
echo "============================================"
echo ""
wait
