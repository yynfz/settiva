#!/usr/bin/env bash
# Deploy settiva.expekerja.com from this checkout.
# Usage: ./scripts/deploy.sh          (pull + build + up)
#        ./scripts/deploy.sh --no-pull (build the working tree as-is)
set -euo pipefail

cd "$(dirname "$0")/.."

DOMAIN=settiva.expekerja.com
VPS_IP=168.110.195.103

if [[ "${1:-}" != "--no-pull" ]]; then
  echo "==> git pull"
  git fetch --prune origin
  git merge --ff-only origin/main
fi

if [[ ! -f package.json ]]; then
  echo "ERROR: no package.json in $(pwd) — nothing to build." >&2
  exit 1
fi

if [[ ! -f .env && ! -f .env.local ]]; then
  echo "WARNING: neither .env nor .env.local exists; the app will start unconfigured." >&2
  echo "         cp .env.example .env && chmod 600 .env   (then fill the values)" >&2
fi

echo "==> build + up"
docker compose up -d --build

echo "==> wait for container"
for i in {1..40}; do
  if docker exec settiva wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1; then
    echo "==> OK: container serving"
    break
  fi
  sleep 2
done

docker compose ps
echo
echo "Local check (bypasses DNS/TLS):"
curl -s -o /dev/null -w "  http://127.0.0.1:8096 -> %{http_code}\n" http://127.0.0.1:8096/ || true

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

# Resolve explicitly against the public IP: this VPS's own resolver can keep
# serving a stale/NXDOMAIN answer long after public DNS has moved.
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
