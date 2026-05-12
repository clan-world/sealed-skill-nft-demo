# Sealed Skill NFTee Demo

A minimal monorepo demo for a **Solana NFTee that controls a secret born inside a TEE-like service**.

The demo shows this story:

1. A Creator TEE generates a private animal artifact.
2. The artifact is encrypted and stored outside the chain.
3. A Solana devnet Token-2022 collectible NFTee is minted to the connected owner wallet.
4. A different connected wallet cannot use the secret before transfer.
5. The owner prepares and completes a broker-authorized transfer to a typed recipient wallet.
6. The new owner can ask the Runtime TEE, “What sound does this animal make?”
7. The secret animal is never shown to either wallet.

This repo uses **mock attestation** for the MVP, but the code is shaped so Automata DCAP or zkVM-compressed attestation can replace it later.

## Start here

- [Run book](docs/RUNBOOK.md) — local demo, devnet setup, AWS deploy, teardown.
- [Architecture](docs/ARCHITECTURE.md) — system diagrams and data flow.
- [Threat model](docs/THREAT_MODEL.md) — what this protects and what it does not.
- [Roadmap](docs/ROADMAP.md) — future real TEE, Automata, transfer hooks, marketplace support.
- [Sources and references](docs/SOURCES.md) — docs and standards used while designing the repo.

## What is real in this MVP?

Real:

- Symmetric encryption for the private artifact.
- Key wrapping between TEE-like services.
- Signed transcripts for creator, broker, and runtime actions.
- Solana devnet minting and transfer flow for a 1-supply Token-2022 collectible NFTee.
- Token-2022 transfer hook enforcement for broker-approved transfers.
- UI step-by-step visualization of TEE processing.
- Local and AWS deployment helpers.
- Runtime access checks against the currently connected wallet signature.

Mocked for MVP:

- TEE hardware attestation.
- On-chain DCAP verification.
- Production hardening for the transfer hook and approval PDA lifecycle.
- Real LLM inference inside an enclave.

## One sentence

The NFTee does not contain the secret. It controls who can ask an approved runtime to use the secret inside a protected environment.
