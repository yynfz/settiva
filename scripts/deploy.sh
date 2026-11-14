#!/usr/bin/env bash
# Pull a published image and (re)start one environment on this VPS.
# Usage: ./scripts/deploy.sh dev|prod
set -euo pipefail

cd "$(dirname "$0")/.."

VPS_IP=168.110.195.103

case "${1:-}" in
  dev)
    SERVICE=settiva-dev
    DOMAIN=settiva-dev.expekerja.com
    PORT=8097
    IMAGE=expekerja/settiva:dev_v0.0.1
    ;;
  prod)
    SERVICE=settiva
    DOMAIN=settiva.expekerja.com
    PORT=8096
    IMAGE=expekerja/settiva:prod_v0.0.1
    ;;
  *)
    echo "Usage: $0 dev|prod" >&2
    exit 2
    ;;
esac

echo "==> deploy $SERVICE ($IMAGE) -> $DOMAIN"

# Images live in a private Docker Hub repo; credentials are in ~/.docker/config.json.
echo "==> pull"
docker compose pull --quiet "$SERVICE" 2>&1 | tail -3

echo "==> up"
docker compose up -d --no-deps "$SERVICE" 2>&1 | tail -5

echo "==> wait for container"
for i in {1..45}; do
  if docker exec "$SERVICE" wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1; then
    echo "==> OK: $SERVICE serving"
    break
  fi
  sleep 2
done

docker compose ps "$SERVICE"
echo
echo "Local check (bypasses DNS/TLS):"
curl -s -o /dev/null -w "  http://127.0.0.1:$PORT -> %{http_code}\n" "http://127.0.0.1:$PORT/" || true

# Resolve via a public resolver and verify against the VPS IP: this host's own
# resolver can keep serving a stale answer long after public DNS has moved.
resolved=$(dig +short "$DOMAIN" A @1.1.1.1 | tail -1)
if [[ -z "$resolved" ]]; then
  echo
  echo "Public check skipped: $DOMAIN has no A record yet."
  echo "Add the DNS record (A $DOMAIN -> $VPS_IP), then the certificate issues on the next request."
  exit 0
fi
if [[ "$resolved" != "$VPS_IP" ]]; then
  echo
  echo "Public check skipped: $DOMAIN resolves to $resolved, not $VPS_IP."
  exit 0
fi

echo "Public check (traefik may need a moment for the certificate):"
for i in {1..30}; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:$VPS_IP" "https://$DOMAIN/" || true)
  if [[ "$code" == "200" ]]; then
    echo "  https://$DOMAIN -> 200"
    exit 0
  fi
  sleep 3
done
echo "  https://$DOMAIN -> ${code:-no response} (not 200 yet)"
exit 1
