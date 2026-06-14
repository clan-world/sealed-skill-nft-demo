# Hackathon Judge Demo

This demo shows encrypted agent data blocks with public decentralized storage and licensed consumption.

## What Is Real

- Solana devnet NFTee mint and transfer transactions are real when `SOLANA_ENABLED=true`.
- Walrus Testnet blob storage is real when `STORAGE_BACKEND=walrus`.
- The three TEEs are Docker fake-attested services for the hackathon demo. They use real encryption, signatures, key wrapping, and policy checks, but not production hardware attestation.

## Recommended Run

```bash
SOLANA_ENABLED=true \
STORAGE_BACKEND=walrus \
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space \
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space \
WALRUS_EPOCHS=1 \
docker compose -f docker-compose.local.yml up --build
```

Open `http://localhost:5173/#/eth-global-nyc-2026`.

## Judge Script

1. Connect wallet A.
2. Register Docker TEEs.
3. Create and store the encrypted animal data block.
4. Open the Walrus blob link in the receipt rail and show it is ciphertext.
5. Mint the Solana NFTee.
6. Consume as wallet A and show only the allowed runtime output.
7. Enter wallet B as recipient and transfer normally.
8. Show wallet A is denied after transfer; connect wallet B and consume successfully.

## What To Point Out

- The hidden animal plaintext never appears in the app.
- The Walrus blob is public, content-addressed ciphertext.
- The Solana NFTee is the transferable license/control object.
- TEE1 releases the key only for the current NFTee owner.
- TEE3 decrypts inside the runtime and returns only the allowed answer.
