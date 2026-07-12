#!/usr/bin/env bash
# Upload purchase email PDFs to Supabase Storage for Edge Functions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/backend/.env}"

FILES=(
  "$ROOT/backend/assets/Manual_Instalacao_Gerador_Legendas.pdf|manual/Manual_Instalacao_Gerador_Legendas.pdf"
  "$ROOT/backend/assets/Guia_Cortes_Virais_Lucrativos.pdf|bonus/Guia_Cortes_Virais_Lucrativos.pdf"
)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found (need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

URL="${SUPABASE_URL%/}"
KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
if [[ -z "$URL" || -z "$KEY" ]]; then
  echo "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in $ENV_FILE" >&2
  exit 1
fi

for entry in "${FILES[@]}"; do
  LOCAL="${entry%%|*}"
  OBJECT="${entry##*|}"
  if [[ ! -f "$LOCAL" ]]; then
    echo "ERROR: PDF not found: $LOCAL" >&2
    exit 1
  fi
  echo "Uploading $LOCAL → storage/assets/$OBJECT"
  HTTP=$(curl -sS -o /tmp/upload-purchase-resp.json -w "%{http_code}" \
    -X POST "$URL/storage/v1/object/assets/$OBJECT" \
    -H "Authorization: Bearer $KEY" \
    -H "apikey: $KEY" \
    -H "Content-Type: application/pdf" \
    -H "x-upsert: true" \
    --data-binary "@$LOCAL")
  if [[ "$HTTP" != "200" ]]; then
    echo "Upload failed HTTP $HTTP for $OBJECT:" >&2
    cat /tmp/upload-purchase-resp.json >&2
    exit 1
  fi
done

echo "OK — purchase PDFs uploaded to Supabase Storage (assets/)"
