#!/bin/bash
# Bootstrap / update Legendas Locais on Ubuntu VPS
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/legendas-locais}"
DOMAIN="${DOMAIN:-}"
UPDATE_ONLY=false
if [[ "${1:-}" == "--update" ]]; then UPDATE_ONLY=true; fi

if [[ -z "$DOMAIN" ]]; then
  echo "WARN: DOMAIN não definido. Exemplo: DOMAIN=legendas.seudominio.com bash deploy/setup.sh"
  DOMAIN="legendas.local"
fi

ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://${DOMAIN},http://${DOMAIN}}"

export DEBIAN_FRONTEND=noninteractive

node_major() {
  node -v 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo 0
}

install_node20() {
  if command -v node >/dev/null && [[ "$(node_major)" -ge 20 ]]; then
    echo "    Node $(node -v) OK"
    return
  fi
  echo "==> Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
}

check_ffmpeg() {
  if ! command -v ffmpeg >/dev/null; then
    echo "ERROR: ffmpeg não encontrado."
    exit 1
  fi
  if ! ffmpeg -hide_banner -filters 2>/dev/null | grep -q " ass "; then
    echo "ERROR: ffmpeg sem suporte libass (filtro ass). Instale um build com libass."
    exit 1
  fi
  echo "    ffmpeg + libass OK"
}

if ! $UPDATE_ONLY; then
  echo "==> Installing system packages..."
  apt-get update -qq
  apt-get install -y -qq \
    python3 python3-venv python3-pip \
    ffmpeg rsync curl git gettext-base
  install_node20
  check_ffmpeg
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
  cat > .env <<EOF
TRANSCRIBE_ENGINE=openai
OPENAI_API_KEY=
ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
CLIPS_MODEL=gpt-5.5
EOF
  echo "    Criado backend/.env — configure a chave em /configuracoes ou edite o arquivo"
fi

echo "==> Frontend fonts..."
bash "$APP_DIR/scripts/sync-frontend-fonts.sh"

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

echo "==> Traefik stack (DOMAIN=${DOMAIN})..."
export DOMAIN
envsubst '${DOMAIN}' < "$APP_DIR/deploy/legendas-stack.template.yaml" > "$APP_DIR/deploy/legendas-stack.yaml"

for d in /etc/traefik/dynamic /opt/traefik/dynamic /root/traefik/dynamic; do
  if [[ -d "$d" ]]; then
    cp "$APP_DIR/deploy/traefik-dynamic-legendas.yml" "$d/legendas-locais.yml"
    echo "    Traefik dynamic: $d/legendas-locais.yml"
  fi
done

if command -v docker >/dev/null; then
  if ! docker info 2>/dev/null | grep -q "Swarm: active"; then
    echo "WARN: Docker Swarm não ativo — rode: docker swarm init"
  fi
  if ! docker network inspect clonefy >/dev/null 2>&1; then
    echo "WARN: Rede Docker 'clonefy' não existe — crie ou ajuste Traefik"
  fi
  systemctl disable nginx 2>/dev/null || true
  systemctl stop nginx 2>/dev/null || true
  cd "$APP_DIR/deploy"
  docker stack deploy -c legendas-stack.yaml legendas 2>/dev/null || \
    echo "WARN: docker stack deploy falhou — verifique Swarm e rede clonefy"
  docker service update --force legendas_legendas-proxy >/dev/null 2>&1 || true
else
  echo "WARN: Docker não encontrado — configure nginx manualmente (deploy/nginx.conf)"
  sed "s/__DOMAIN__/${DOMAIN}/g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/legendas-locais
fi

echo ""
echo "============================================"
echo "  Deploy OK: https://${DOMAIN}"
echo "  1. Abra https://${DOMAIN}/configuracoes"
echo "  2. Cole sua OPENAI_API_KEY e salve"
echo "  Health: curl -s http://127.0.0.1:8000/api/health"
echo "============================================"
