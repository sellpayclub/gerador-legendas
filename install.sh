#!/bin/bash
# Instalador unificado — Mac ou VPS Ubuntu
# Uso:
#   cp .env.example backend/.env   # edite e cole OPENAI_API_KEY
#   bash install.sh
#   bash install.sh --update       # atualizar após git pull
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
UPDATE=false
[[ "${1:-}" == "--update" ]] && UPDATE=true

echo ""
echo "============================================"
echo "  Legendas Locais — Instalador"
echo "============================================"
echo ""

# Garante backend/.env
if [[ ! -f "$ROOT/backend/.env" ]]; then
  if [[ -f "$ROOT/.env.example" ]]; then
    cp "$ROOT/.env.example" "$ROOT/backend/.env"
    echo "==> Criado backend/.env a partir de .env.example"
    echo "    Edite backend/.env e cole OPENAI_API_KEY=sk-... antes de usar o app."
  elif [[ -f "$ROOT/backend/.env.example" ]]; then
    cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
    echo "==> Criado backend/.env — edite e cole sua chave OpenAI."
  fi
fi

# Carrega variáveis do .env do backend
if [[ -f "$ROOT/backend/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/backend/.env"
  set +a
fi

OS="$(uname -s)"

if [[ "$OS" == "Darwin" ]]; then
  echo "==> Detectado: macOS"
  bash "$ROOT/scripts/preflight-mac.sh"
  bash "$ROOT/scripts/instalar-mac.sh"
  echo ""
  echo "============================================"
  echo "  Instalação Mac concluída!"
  echo ""
  echo "  1. Abra http://localhost:3000/configuracoes"
  echo "  2. Cole sua API key OpenAI → Testar → Salvar"
  echo ""
  echo "  Comandos úteis:"
  echo "    ./legendas.sh status"
  echo "    ./legendas.sh reiniciar"
  echo "    ./legendas.sh logs"
  echo "============================================"
  exit 0
fi

if [[ "$OS" == "Linux" ]]; then
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "ERRO: na VPS, rode como root: sudo bash install.sh"
    exit 1
  fi

  echo "==> Detectado: Linux (VPS)"

  if [[ -z "${DOMAIN:-}" ]]; then
    DOMAIN="app.clipsaas.site"
    echo "==> Domínio: ${DOMAIN}"
    # Persiste no .env
    if [[ -f "$ROOT/backend/.env" ]]; then
      if grep -q '^DOMAIN=' "$ROOT/backend/.env" 2>/dev/null; then
        sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" "$ROOT/backend/.env"
      else
        echo "DOMAIN=${DOMAIN}" >> "$ROOT/backend/.env"
      fi
    fi
  fi

  export DOMAIN
  export APP_DIR="$ROOT"
  if $UPDATE; then
    bash "$ROOT/deploy/setup.sh" --update
  else
    bash "$ROOT/deploy/setup.sh"
  fi
  exit 0
fi

echo "ERRO: sistema operacional não suportado: $OS"
exit 1
