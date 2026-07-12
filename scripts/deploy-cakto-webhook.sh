#!/usr/bin/env bash
# Deploy cakto-webhook Edge Function + sync secrets from backend/.env
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
  echo "Then link the org that owns lcbczyzedluaoxtuajoz." >&2
  echo "See scripts/CAKTO-WEBHOOK-SETUP.md for manual Dashboard steps." >&2
  exit 1
fi

echo "=== Link project (if needed) ==="
$SUPABASE_BIN link --project-ref "$PROJECT_REF" 2>/dev/null || true

echo "=== Set Edge Function secrets ==="
$SUPABASE_BIN secrets set \
  "CAKTO_WEBHOOK_SECRET=${CAKTO_WEBHOOK_SECRET:-}" \
  "RESEND_API_KEY=${RESEND_API_KEY:-}" \
  "RESEND_FROM_EMAIL=${RESEND_FROM_EMAIL//\"/}" \
  "APP_PUBLIC_URL=${APP_PUBLIC_URL:-https://app.clipsaas.site}" \
  --project-ref "$PROJECT_REF"

echo "=== Deploy cakto-webhook ==="
$SUPABASE_BIN functions deploy cakto-webhook --no-verify-jwt --project-ref "$PROJECT_REF"

echo "=== Upload manual PDF ==="
bash "$ROOT/scripts/upload-manual-supabase.sh"

echo ""
echo "Done. Webhook URL:"
echo "  https://${PROJECT_REF}.supabase.co/functions/v1/cakto-webhook"
echo ""
echo "Configure this URL in Cakto and ensure CAKTO_WEBHOOK_SECRET matches the Cakto panel."
