#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../programs/sealed-skill"
anchor build
anchor deploy --provider.cluster localnet
