#!/bin/bash
# Produção local — standalone Next.js (output: standalone no next.config).
set -euo pipefail
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/usr/bin:/bin"
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-127.0.0.1}"
export BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
export NODE_ENV=production

if [[ ! -f .next/standalone/server.js ]]; then
  echo "Build ausente — rode: npm run build" >&2
  exit 1
fi

mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
if [[ -d public ]]; then
  rm -rf .next/standalone/public
  cp -r public .next/standalone/public
fi

cd .next/standalone
exec node server.js
