#!/usr/bin/env bash
# Test Supabase cakto-webhook Edge Function (after deploy + secrets).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/backend/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

SECRET="${CAKTO_WEBHOOK_SECRET:-}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-lcbczyzedluaoxtuajoz}"
URL="https://${PROJECT_REF}.supabase.co/functions/v1/cakto-webhook"
EMAIL="${1:-test@example.com}"

if [[ -z "$SECRET" ]]; then
  echo "ERROR: CAKTO_WEBHOOK_SECRET not set in $ENV_FILE" >&2
  exit 1
fi

PAYLOAD=$(cat <<EOF
{
  "secret": "$SECRET",
  "event": "purchase_approved",
  "data": {
    "id": "test-$(date +%s)",
    "customer": {
      "name": "Teste Webhook",
      "email": "$EMAIL",
      "phone": "5561999999999"
    },
    "product": { "name": "ClipSaaS — Gerador de Legendas" },
    "amount": 97.0,
    "paidAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}
EOF
)

echo "POST $URL"
HTTP=$(curl -sS -o /tmp/cakto-webhook-test.json -w "%{http_code}" \
  -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

echo "HTTP $HTTP"
cat /tmp/cakto-webhook-test.json
echo ""

if [[ "$HTTP" == "403" ]]; then
  echo ""
  echo "403 = secret no Supabase (Edge Functions → Secrets) difere do CAKTO_WEBHOOK_SECRET no .env"
  echo "Copie a chave do painel Cakto para Supabase Secrets e tente de novo."
fi
