#!/usr/bin/env bash
# Add websecure entrypoint timeouts for large video uploads (HTTPS).
# Uses docker stack deploy — NEVER use `docker service update --args` (keeps only last arg).
set -euo pipefail

TRAEFIK_YAML="${TRAEFIK_YAML:-/root/traefik.yaml}"
STACK_NAME="${STACK_NAME:-traefik}"

if [[ ! -f "$TRAEFIK_YAML" ]]; then
  echo "ERROR: $TRAEFIK_YAML not found" >&2
  exit 1
fi

if grep -q 'websecure.transport.respondingTimeouts.readTimeout' "$TRAEFIK_YAML"; then
  echo "Traefik websecure timeouts already in $TRAEFIK_YAML"
else
  echo "Adding websecure readTimeout/idleTimeout=7200s to $TRAEFIK_YAML ..."
  sed -i '/entrypoints.websecure.address=:443/a\      - "--entrypoints.websecure.transport.respondingTimeouts.readTimeout=7200"\n      - "--entrypoints.websecure.transport.respondingTimeouts.idleTimeout=7200"' "$TRAEFIK_YAML"
fi

docker stack deploy -c "$TRAEFIK_YAML" "$STACK_NAME"
echo "Done. Verify: curl -sk https://app.clipsaas.site/api/health"
