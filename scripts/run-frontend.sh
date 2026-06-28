#!/bin/bash
# Inicia o frontend (Next.js em produção). Usado pelo serviço do macOS (launchd).
cd /Users/dannmacbook/legendas-locais/frontend || exit 1
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/usr/bin:/bin"
export PORT=3000
export HOSTNAME=127.0.0.1
export BACKEND_URL="http://127.0.0.1:8000"
# Rede de segurança: se ainda não houver build de produção, compila antes de subir.
if [ ! -d .next ]; then
  npm run build
fi
exec npm run start
