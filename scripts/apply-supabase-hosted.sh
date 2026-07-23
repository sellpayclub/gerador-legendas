#!/usr/bin/env bash
# Apply ClipSaaS hosted migrations to a remote Supabase Postgres database.
#
# Usage:
#   export SUPABASE_DB_URL='postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres'
#   ./scripts/apply-supabase-hosted.sh
#
# Verify only (REST smoke test, no DDL):
#   SUPABASE_SERVICE_ROLE_KEY=... ./scripts/apply-supabase-hosted.sh --verify-only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS=(
  "$ROOT/supabase/migrations/002_clipsaas_hosted.sql"
  "$ROOT/supabase/migrations/003_profiles_rls_lockdown.sql"
  "$ROOT/supabase/migrations/004_webhook_events.sql"
  "$ROOT/supabase/migrations/010_asaas_checkout.sql"
)

verify_rest() {
  SUPABASE_URL="${SUPABASE_URL:-https://lcbczyzedluaoxtuajoz.supabase.co}" \
  SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}" \
  python3 "$ROOT/scripts/smoke-supabase-hosted.py"
}

if [[ "${1:-}" == "--verify-only" ]]; then
  verify_rest
  exit $?
fi

for MIGRATION in "${MIGRATIONS[@]}"; do
  if [[ ! -f "$MIGRATION" ]]; then
    echo "Migration not found: $MIGRATION" >&2
    exit 1
  fi
done

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  cat >&2 <<'EOF'
SUPABASE_DB_URL is not set.

Export your Postgres URI before running, e.g.:
  export SUPABASE_DB_URL='postgresql://postgres.lcbczyzedluaoxtuajoz:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres'

Find it in Supabase Dashboard → Project Settings → Database → Connection string.
EOF
  exit 1
fi

apply_one() {
  local file="$1"
  echo "Applying $file ..."
  if command -v psql >/dev/null 2>&1; then
    psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$file"
  else
    MIGRATION="$file" python3 - <<'PY'
import os, subprocess, sys

try:
    import psycopg2
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "psycopg2-binary"])
    import psycopg2

migration = os.environ["MIGRATION"]
with open(migration) as f:
    sql = f.read()
conn = psycopg2.connect(os.environ["SUPABASE_DB_URL"])
conn.autocommit = True
try:
    with conn.cursor() as cur:
        cur.execute(sql)
finally:
    conn.close()
print("Migration applied via psycopg2.")
PY
  fi
}

for MIGRATION in "${MIGRATIONS[@]}"; do
  apply_one "$MIGRATION"
done

echo "Migrations applied. Running REST verification..."
verify_rest
