#!/usr/bin/env bash
# Entry point for CI over SSH. The deploy key is locked to this script, so the
# only thing a caller can do is name an environment.
set -euo pipefail

cd "$(dirname "$0")/.."

case "${SSH_ORIGINAL_COMMAND:-}" in
  deploy-dev)  exec ./scripts/deploy.sh dev ;;
  deploy-prod) exec ./scripts/deploy.sh prod ;;
  *)
    echo "refused: only 'deploy-dev' or 'deploy-prod' is allowed" >&2
    exit 1
    ;;
esac
