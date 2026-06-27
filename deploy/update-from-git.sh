#!/bin/bash
# Atualiza produção na VPS a partir do GitHub.
# Uso na VPS: bash /opt/legendas-locais/deploy/update-from-git.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/legendas-locais}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

if [[ ! -d .git ]]; then
  echo "ERRO: $APP_DIR não é um repositório git. Veja deploy/MANUTENCAO.md"
  exit 1
fi

echo "==> git pull ($BRANCH)..."
git fetch origin
git pull origin "$BRANCH"

echo "==> rebuild + restart..."
bash "$APP_DIR/deploy/setup.sh" --update

echo "==> health check..."
curl -sf http://127.0.0.1:8000/api/health
curl -sf -o /dev/null "https://${DOMAIN:-legendas.clonefyia.com}/api/health" || true
echo ""
echo "OK: https://${DOMAIN:-legendas.clonefyia.com}"
