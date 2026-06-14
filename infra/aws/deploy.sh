#!/usr/bin/env bash
set -euo pipefail
HOST="${1:-}"
if [ -z "$HOST" ]; then
  echo "Usage: infra/aws/deploy.sh ec2-user@PUBLIC_DNS"
  exit 1
fi
REMOTE_HOST="${HOST#*@}"
rsync -az --delete --exclude node_modules --exclude data --exclude .git ./ "$HOST:~/sealed-skill-nft-demo/"
ssh "$HOST" "cd ~/sealed-skill-nft-demo && DEMO_WEB_HOST_BIND=0.0.0.0 DEMO_API_HOST_BIND=0.0.0.0 VITE_API_BASE_URL=http://${REMOTE_HOST}:8787 VITE_DEV_ALLOWED_HOSTS=${REMOTE_HOST} API_CORS_ORIGIN=http://${REMOTE_HOST}:5173 docker compose -f docker-compose.local.yml up -d --build"
echo "Deployed. Open http://${REMOTE_HOST}:5173"
