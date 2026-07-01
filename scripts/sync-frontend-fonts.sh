#!/bin/bash
# Copia fontes do backend para o frontend (build offline na VPS — sem Google Fonts).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/backend/fonts"
DST="$ROOT/frontend/public/fonts"
mkdir -p "$DST"
if [[ ! -d "$SRC" ]] || ! compgen -G "$SRC/*.ttf" > /dev/null; then
  echo "WARN: $SRC vazio — rode scripts/download-fonts.sh primeiro"
  exit 0
fi
cp -f "$SRC"/*.ttf "$DST/"
echo "==> Fontes em $DST ($(ls "$DST"/*.ttf 2>/dev/null | wc -l | tr -d ' ') arquivos)"
