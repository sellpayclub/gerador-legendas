#!/usr/bin/env bash
# Deploy openpix-webhook Edge Function + sync secrets from backend/.env
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/backend/.env}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-lcbczyzedluaoxtuajoz}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if ! command -v supabase >/dev/null 2>&1; then
  SUPABASE_BIN="npx --yes supabase@latest"
else
  SUPABASE_BIN="supabase"
fi

echo "=== Verify project access ==="
if ! $SUPABASE_BIN projects list 2>/dev/null | grep -q "$PROJECT_REF"; then
  echo "ERROR: Project $PROJECT_REF not found in logged-in Supabase account." >&2
  echo "Run: npx supabase login" >&2
  echo "See scripts/OPENPIX-WEBHOOK-SETUP.md for manual Dashboard steps." >&2
  exit 1
fi

echo "=== Link project (if needed) ==="
$SUPABASE_BIN link --project-ref "$PROJECT_REF" 2>/dev/null || true

echo "=== Set Edge Function secrets ==="
# Fallback: read Meta CAPI token from global_settings when not in backend/.env
if [[ -z "${META_CAPI_ACCESS_TOKEN:-}" ]] && [[ -n "${SUPABASE_URL:-}" ]] && [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  META_CAPI_ACCESS_TOKEN="$(curl -sf \
    "${SUPABASE_URL}/rest/v1/global_settings?id=eq.default&select=meta_capi_token" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    | python3 -c "import sys,json; rows=json.load(sys.stdin); print((rows[0].get('meta_capi_token') or '').strip()) if rows else ''" 2>/dev/null || true)"
fi
if [[ -z "${META_PIXEL_ID:-}" ]] && [[ -n "${SUPABASE_URL:-}" ]] && [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  META_PIXEL_ID="$(curl -sf \
    "${SUPABASE_URL}/rest/v1/global_settings?id=eq.default&select=fb_pixel_id" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    | python3 -c "import sys,json; rows=json.load(sys.stdin); print((rows[0].get('fb_pixel_id') or '').strip()) if rows else ''" 2>/dev/null || true)"
fi

if [[ -z "${META_CAPI_ACCESS_TOKEN:-}" ]]; then
  echo "WARN: META_CAPI_ACCESS_TOKEN vazio — CAPI no webhook pode falhar." >&2
fi

$SUPABASE_BIN secrets set \
  "RESEND_API_KEY=${RESEND_API_KEY:-}" \
  "RESEND_FROM_EMAIL=${RESEND_FROM_EMAIL//\"/}" \
  "APP_PUBLIC_URL=${APP_PUBLIC_URL:-https://app.clipsaas.site}" \
  "META_PIXEL_ID=${META_PIXEL_ID:-4238854449777594}" \
  "META_CAPI_ACCESS_TOKEN=${META_CAPI_ACCESS_TOKEN:-}" \
  --project-ref "$PROJECT_REF"

echo "=== Deploy openpix-webhook ==="
$SUPABASE_BIN functions deploy openpix-webhook --no-verify-jwt --project-ref "$PROJECT_REF"

echo ""
echo "Done. Webhook URL (configure in OpenPix/Woovi):"
echo "  https://${PROJECT_REF}.supabase.co/functions/v1/openpix-webhook"
echo ""
echo "Events: OPENPIX:CHARGE_CREATED, OPENPIX:CHARGE_COMPLETED"
