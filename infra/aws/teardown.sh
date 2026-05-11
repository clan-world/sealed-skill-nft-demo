#!/usr/bin/env bash
set -euo pipefail
HOST="${1:-}"
if [ -z "$HOST" ]; then
  echo "Usage: infra/aws/teardown.sh ec2-user@PUBLIC_DNS"
  exit 1
fi
ssh "$HOST" 'cd ~/sealed-skill-nft-demo && docker compose -f docker-compose.local.yml down -v || true'
echo "Stopped app services. Run terraform destroy to remove EC2."
