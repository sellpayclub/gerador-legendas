#!/bin/bash
# Bootstrap / update Legendas Locais on Ubuntu VPS
set -euo pipefail

APP_DIR="/opt/legendas-locais"
DOMAIN="${DOMAIN:-legendas.clonefyia.com}"
UPDATE_ONLY=false
if [[ "${1:-}" == "--update" ]]; then UPDATE_ONLY=true; fi

export DEBIAN_FRONTEND=noninteractive

if ! $UPDATE_ONLY; then
  echo "==> Installing system packages..."
  apt-get update -qq
  apt-get install -y -qq \
    python3 python3-venv python3-pip \
    nodejs npm \
    ffmpeg nginx certbot python3-certbot-nginx \
    rsync curl git

  mkdir -p "$APP_DIR"
fi

cd "$APP_DIR"

echo "==> Backend venv + deps..."
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -q -U pip
pip install -q -e .

if [[ ! -f .env ]]; then
  echo "WARN: backend/.env missing — create it with OPENAI_API_KEY and TRANSCRIBE_ENGINE=openai"
  cat > .env <<'EOF'
TRANSCRIBE_ENGINE=openai
OPENAI_API_KEY=
ALLOWED_ORIGINS=https://legendas.clonefyia.com,http://legendas.clonefyia.com
EOF
fi

echo "==> Frontend build..."
cd "$APP_DIR/frontend"
npm ci --silent 2>/dev/null || npm install --silent
export BACKEND_URL=http://127.0.0.1:8000
npm run build
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
if [[ -d public ]]; then cp -r public .next/standalone/public; fi

echo "==> systemd services..."
cp "$APP_DIR/deploy/legendas-backend.service" /etc/systemd/system/
cp "$APP_DIR/deploy/legendas-frontend.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable legendas-backend legendas-frontend
systemctl restart legendas-backend legendas-frontend

echo "==> Traefik reverse proxy (Docker Swarm)..."
systemctl disable nginx 2>/dev/null || true
systemctl stop nginx 2>/dev/null || true
cd "$APP_DIR/deploy"
docker stack deploy -c legendas-stack.yaml legendas
# Force the proxy to restart so the bind-mounted nginx.conf is reloaded.
docker service update --force legendas_legendas-proxy >/dev/null 2>&1 || true

echo ""
echo "============================================"
echo "  Deploy OK: https://$DOMAIN"
echo "  Backend health: curl -s http://127.0.0.1:8000/api/health"
echo "  Traefik stack: docker service ls | grep legendas"
echo "============================================"
