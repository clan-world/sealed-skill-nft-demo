#!/usr/bin/env bash
set -euo pipefail
HOST="${1:-}"
if [ -z "$HOST" ]; then
  echo "Usage: infra/aws/deploy.sh ec2-user@PUBLIC_DNS"
  exit 1
fi
rsync -az --delete --exclude node_modules --exclude data --exclude .git ./ "$HOST:~/sealed-skill-nft-demo/"
ssh "$HOST" 'cd ~/sealed-skill-nft-demo && docker compose -f docker-compose.local.yml up -d --build'
echo "Deployed. Open http://${HOST#*@}:5173"
