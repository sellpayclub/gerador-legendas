#!/bin/bash
# Verifica/instala pré-requisitos no macOS antes do install.sh
set -euo pipefail

echo "==> Verificando pré-requisitos (Mac)..."

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "    (preflight-mac ignorado — não é macOS)"
  exit 0
fi

install_brew_pkg() {
  local pkg="$1"
  if brew list "$pkg" &>/dev/null; then
    echo "    $pkg OK"
  else
    echo "    Instalando $pkg..."
    brew install "$pkg"
  fi
}

if ! command -v brew >/dev/null; then
  echo ""
  echo "ERRO: Homebrew não encontrado."
  echo "Instale em https://brew.sh com:"
  echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  echo ""
  echo "Depois rode novamente: bash install.sh"
  exit 1
fi

install_brew_pkg python@3.13
install_brew_pkg node@20
install_brew_pkg ffmpeg-full

if ! command -v python3.13 >/dev/null; then
  echo "ERRO: python3.13 não encontrado após instalar python@3.13."
  echo "Adicione ao PATH: export PATH=\"/opt/homebrew/opt/python@3.13/bin:\$PATH\""
  exit 1
fi

NODE_BIN="/opt/homebrew/opt/node@20/bin"
if [[ -d "$NODE_BIN" ]]; then
  export PATH="$NODE_BIN:$PATH"
fi

FFMPEG_BIN="/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
if [[ ! -x "$FFMPEG_BIN" ]]; then
  echo "ERRO: ffmpeg-full não encontrado em $FFMPEG_BIN"
  exit 1
fi

if ! "$FFMPEG_BIN" -hide_banner -filters 2>/dev/null | grep -q " ass "; then
  echo "ERRO: ffmpeg-full sem filtro ass (libass). Rode: brew reinstall ffmpeg-full"
  exit 1
fi

echo "    python3.13 $(python3.13 --version 2>&1 | awk '{print $2}')"
echo "    node $(node --version 2>/dev/null || echo '?')"
echo "    ffmpeg-full + libass OK"
echo "==> Pré-requisitos OK"
