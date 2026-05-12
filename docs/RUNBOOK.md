# Run Book

This guide assumes you are comfortable with a terminal, but it avoids hidden magic.

## 1. Install prerequisites

Install:

- Node.js 22 or newer.
- Corepack, usually included with Node.
- Git.
- Solana CLI, only needed for funding/checking devnet keys.
- Terraform, only needed for AWS deployment.

Enable pnpm:

```bash
corepack enable
corepack prepare pnpm@10.11.1 --activate
```

If `pnpm` still does not work, use:

```bash
corepack pnpm --version
```

## 2. Install dependencies

```bash
pnpm install
```

## 3. Run tests

```bash
pnpm test
```

The tests focus on the highest-value flows:

- Artifact encryption and decryption.
- Key wrapping and unwrapping.
- Transcript signing and verification.
- Replay-sensitive capsule fields.
- Demo state transitions.

## 4. Start local services

Copy environment file:

```bash
cp .env.example .env
```

For a fully local story without devnet minting, keep:

```bash
SOLANA_ENABLED=false
```

Start the API and three TEE-like services:

```bash
pnpm dev:services
```

In another terminal, start the UI:

```bash
pnpm dev:web
```

Open:

```text
http://localhost:5173
```

## 5. Run with Solana devnet minting

Set this in `.env`:

```bash
SOLANA_ENABLED=true
SOLANA_CLUSTER=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
BACKEND_KEYPAIR_PATH=../../data/solana/backend-keypair.json
```

Create a backend keypair:

```bash
pnpm --filter @sealed-skill/solana-client-cli start keypair:init
```

Fund it on devnet:

```bash
pnpm --filter @sealed-skill/solana-client-cli start solana:airdrop
```

If the public faucet is busy, copy the printed public key and use any Solana devnet faucet.

Restart the services:

```bash
pnpm dev:services
```

Then use the UI.

## 6. Demo script

1. Connect Wallet A in the browser.
2. Click **Register TEEs**.
3. Click **Generate sealed animal artifact**.
4. The Creator TEE checklist lights up one step at a time.
5. The UI shows encrypted artifact hash, sealed key hash, and NFTee mint.
6. Click **Wallet B tries before transfer**.
7. Runtime TEE rejects Wallet B.
8. Click **Prepare transfer A to B**.
9. Broker TEE checklist lights up and creates a transfer capsule.
10. Click **Complete transfer on Solana**.
11. Wallet A signs the token transfer.
12. Click **Wallet B asks runtime**.
13. Runtime TEE returns an allowed output like `quack`.
14. The secret animal name remains hidden.

## 7. AWS deployment

The AWS path is intentionally cheap and simple. It provisions one small EC2 host with Docker.

It does **not** create real hardware enclaves by default. That is a future hardening step.

```bash
cd infra/aws/terraform
terraform init
terraform apply
```

After apply, copy the output host name.

From the repo root:

```bash
infra/aws/deploy.sh ubuntu@YOUR_HOSTNAME
```

The deploy script copies the repo, installs dependencies, and starts services with Docker Compose.

## 8. AWS teardown

Stop app services:

```bash
infra/aws/teardown.sh ubuntu@YOUR_HOSTNAME
```

Destroy cloud resources:

```bash
cd infra/aws/terraform
terraform destroy
```

## 9. Solana program deployment helpers

The Anchor program is in `programs/sealed-skill`.

It is included as a future on-chain registry/verification path. The TypeScript demo currently uses the API plus devnet token mint/transfer for speed.

Localnet:

```bash
infra/solana/deploy-localnet.sh
```

Devnet:

```bash
infra/solana/deploy-devnet.sh
```

You need Rust, Solana CLI, and Anchor installed for this part.
