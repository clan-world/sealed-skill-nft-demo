# Threat Model

## Protects against

### Wallet B using the artifact before transfer

TEE3 and the API check current NFTee ownership before allowing runtime execution.

### Wallet A using the artifact after transfer

Requests bind to current owner, epoch, nonce, and expiry. Old capsules become stale after transfer.

### Direct storage reads

Storage only contains encrypted artifacts.

### Tampered encrypted artifact

The artifact hash is recorded. Authenticated encryption also binds artifact metadata as associated data.

### Fake TEE output

TEE actions are signed. The registry tracks which TEE keys are approved.

### Replay of old requests

Transcripts include nonce, expiry, artifact ID, NFTee mint, owner, and epoch.

## Does not protect against

### TEE hardware exploit

If the hardware or enclave runtime is compromised, secrets may leak.

### Malicious approved runtime

If you approve a runtime that prints the secret, the system will print the secret.

### Bad output policy

If allowed outputs reveal too much over time, users may infer the secret.

### Denial of service

TEE operators can go offline.

### Mock attestation trust

The MVP uses mock attestation. Production needs real attestation.

### Backend trust in the MVP

The demo API coordinates flows and stores demo state. The roadmap moves more checks into Solana programs and attested registries.

## Demo honesty

The MVP proves the architecture and flow. It does not claim production-grade TEE security yet.
