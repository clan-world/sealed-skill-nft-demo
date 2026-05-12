# Architecture

## Core idea

The NFTee holder owns a transferable control right.

The holder does not receive:

- the raw artifact,
- the raw symmetric key,
- or the plaintext animal name.

Only an approved runtime can use the secret internally.

## Roles

### TEE1 — Broker TEE

The broker controls access to the artifact key.

It checks owner-bound transfer/access capsules and releases short-lived wrapped keys to approved runtimes.

### TEE2 — Creator TEE

The creator generates the scarce artifact.

For the MVP, the artifact is a hidden animal plus a random trait and seed.

### TEE3 — Runtime TEE

The runtime answers one approved question:

> What sound does this animal make?

It can return `quack`, `woof`, `moo`, and similar outputs. It cannot return the raw artifact.

## System overview

```mermaid
flowchart TD
    UI[React demo UI] --> API[API coordinator]
    API --> TEE2[TEE2 Creator]
    API --> TEE1[TEE1 Broker]
    API --> TEE3[TEE3 Runtime]

    TEE2 --> Storage[(Encrypted blob storage)]
    TEE2 --> State[(Demo state)]
    TEE1 --> State
    TEE3 --> Storage
    TEE3 --> TEE1

    API --> Solana[(Solana devnet)]
    Solana --> NFTee[1-supply demo NFTee token]
```

## Creation flow

```mermaid
sequenceDiagram
    participant A as Wallet A
    participant UI as Demo UI
    participant API as API
    participant Creator as TEE2 Creator
    participant Broker as TEE1 Broker
    participant Storage as Storage
    participant Solana as Solana devnet

    A->>UI: Connect wallet
    UI->>API: Generate sealed animal artifact
    API->>Broker: Read broker wrapping public key
    API->>Creator: Prompt + Wallet A + Broker key + Runtime policy
    Creator->>Creator: Pick hidden animal
    Creator->>Creator: Generate symmetric key
    Creator->>Creator: Encrypt artifact
    Creator->>Storage: Save encrypted blob
    Creator->>Creator: Wrap key to Broker TEE
    Creator->>API: Signed creation transcript
    API->>Solana: Mint 1-supply demo NFTee token to Wallet A
    API->>UI: Artifact hash + NFTee mint + hidden plaintext
```

## Access flow

```mermaid
sequenceDiagram
    participant B as Wallet B
    participant API as API
    participant Runtime as TEE3 Runtime
    participant Broker as TEE1 Broker
    participant Storage as Storage
    participant Solana as Solana devnet

    B->>API: Signed runtime request
    API->>Solana: Check current NFTee owner
    API->>Runtime: Caller + artifact + prompt
    Runtime->>Broker: Request session key
    Broker->>Broker: Check caller is current owner
    Broker->>Broker: Wrap artifact key to runtime session key
    Broker->>Runtime: Session-wrapped key
    Runtime->>Storage: Load encrypted artifact
    Runtime->>Runtime: Decrypt inside runtime
    Runtime->>Runtime: Apply output policy
    Runtime->>API: Signed runtime transcript + allowed output
    API->>B: Return output
```

## Transfer flow

```mermaid
sequenceDiagram
    participant A as Wallet A
    participant B as Wallet B
    participant UI as Demo UI
    participant API as API
    participant Broker as TEE1 Broker
    participant Solana as Solana devnet

    UI->>API: Prepare transfer A to B
    API->>Broker: Transfer request
    Broker->>Broker: Build owner-bound transfer capsule
    Broker->>API: Signed capsule
    API->>UI: Transfer ready
    UI->>Solana: Wallet A signs token transfer
    Solana->>Solana: NFTee owner changes to B
    UI->>API: Complete transfer with signature
    API->>Solana: Verify B owns NFTee
    API->>UI: Transfer complete
```

## Why this MVP uses mock attestation

Real TEE quote verification is not a small UI feature. It needs hardware, certificates, quote verification, freshness checks, and usually a registry.

This repo models the correct shape:

- every TEE has a public key,
- every TEE has a measurement,
- every TEE produces an attestation object,
- every important action is signed,
- and every transcript binds to the artifact, wallet, NFTee, nonce, and epoch.

The roadmap replaces mock attestation with Automata DCAP and zkVM-compressed attestation.
