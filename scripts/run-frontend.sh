#!/bin/bash
# Inicia o frontend (Next.js produção / standalone). Usado pelo serviço do macOS (launchd).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend" || exit 1
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/usr/bin:/bin"
export BACKEND_URL="http://127.0.0.1:8000"

needs_build=0
if [[ ! -f .next/BUILD_ID ]] || [[ ! -f .next/standalone/server.js ]]; then
  needs_build=1
else
  newer="$(find app components lib public -type f \( -name '*.tsx' -o -name '*.ts' -o -name '*.css' -o -name '*.mjs' \) -newer .next/BUILD_ID 2>/dev/null | head -1 || true)"
  if [[ -n "$newer" ]]; then
    needs_build=1
  fi
fi

if [[ "$needs_build" = "1" ]]; then
  echo "[frontend] Compilando (build ausente ou código alterado)..."
  npm run build
fi

exec bash scripts/start-prod.sh
