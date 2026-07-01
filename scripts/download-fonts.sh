#!/bin/bash
# Download bundled subtitle fonts (regular + bold + italic) into backend/fonts/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/backend/fonts"
mkdir -p "$DIR"

echo "==> Baixando fontes para $DIR"

curl -fsSL -o "$DIR/Roboto-Regular.ttf" \
  "https://fonts.gstatic.com/s/roboto/v32/KFOmCnqEu92Fr1Me5Q.ttf"
curl -fsSL -o "$DIR/Roboto-Bold.ttf" \
  "https://github.com/googlefonts/roboto-2/raw/main/src/hinted/Roboto-Bold.ttf"
curl -fsSL -o "$DIR/Roboto-Italic.ttf" \
  "https://github.com/googlefonts/roboto-2/raw/main/src/hinted/Roboto-Italic.ttf"

curl -fsSL -o "$DIR/OpenSans-Regular.ttf" \
  "https://raw.githubusercontent.com/googlefonts/opensans/main/fonts/ttf/OpenSans-Regular.ttf"
curl -fsSL -o "$DIR/OpenSans-Bold.ttf" \
  "https://raw.githubusercontent.com/googlefonts/opensans/main/fonts/ttf/OpenSans-Bold.ttf"
curl -fsSL -o "$DIR/OpenSans-Italic.ttf" \
  "https://raw.githubusercontent.com/googlefonts/opensans/main/fonts/ttf/OpenSans-Italic.ttf"

curl -fsSL -o "$DIR/Lato-Regular.ttf" \
  "https://cdn.jsdelivr.net/fontsource/fonts/lato@latest/latin-400-normal.ttf"
curl -fsSL -o "$DIR/Lato-Bold.ttf" \
  "https://cdn.jsdelivr.net/fontsource/fonts/lato@latest/latin-700-normal.ttf"

curl -fsSL -o "$DIR/Raleway-Regular.ttf" \
  "https://cdn.jsdelivr.net/fontsource/fonts/raleway@latest/latin-400-normal.ttf"
curl -fsSL -o "$DIR/Raleway-Bold.ttf" \
  "https://cdn.jsdelivr.net/fontsource/fonts/raleway@latest/latin-700-normal.ttf"

curl -fsSL -o "$DIR/Inter-Bold.ttf" \
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf"

curl -fsSL -o "$DIR/Montserrat-Bold.ttf" \
  "https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-700-normal.ttf"

curl -fsSL -o "$DIR/NotoColorEmoji.ttf" \
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main/fonts/NotoColorEmoji.ttf"

echo "==> Fontes prontas:"
ls -lh "$DIR"/*.ttf 2>/dev/null | awk '{print $9, $5}'
