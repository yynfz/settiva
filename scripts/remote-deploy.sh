#!/usr/bin/env bash
# Entry point for CI over SSH. The deploy key is locked to this script, so the
# only things a caller can do are name an environment and an image tag.
set -euo pipefail

cd "$(dirname "$0")/.."

read -r action tag <<< "${SSH_ORIGINAL_COMMAND:-}"

case "$action" in
  deploy-dev)  env_name=dev ;;
  deploy-prod) env_name=prod ;;
  *) echo "refused: only 'deploy-dev' or 'deploy-prod' is allowed" >&2; exit 1 ;;
esac

if [[ -z "${tag:-}" ]]; then
  exec ./scripts/deploy.sh "$env_name"
fi

if [[ ! "$tag" =~ ^(dev|prod)_v[0-9A-Za-z._-]+$ ]]; then
  echo "refused: invalid image tag '$tag'" >&2
  exit 1
fi

exec ./scripts/deploy.sh "$env_name" "$tag"
