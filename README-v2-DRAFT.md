# Sealed Skill NFT

**A Solana-native primitive for NFTs that carry private, owner-only data — the encrypted payload travels with the token, but only the holder can read it.**

Ported from ERC-7857 on EVM. Designed for AI agents, sealed credentials, private game state, and anything else that needs to be ownable *and* confidential at the same time.

![Solana](https://img.shields.io/badge/Solana-9945ff?style=for-the-badge&logo=solana&logoColor=fff)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=fff)
![Status](https://img.shields.io/badge/Status-Hackathon%20Demo-14f195?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-2a1d0c?style=for-the-badge)

> ### *Own the token. Hold the key. Read the secret.*

[**🏰 clan-world.com**](https://clan-world.com) · [**🎮 Showcase: Clan World**](https://github.com/clan-world/clan-world-game) · [**▶ Watch Demo**](#-run-it)

---

## ❖ Why this matters

Every NFT on Solana today carries **public** metadata. The image, the traits, the JSON — anyone with the mint address can read it.

That's fine for profile pictures. It is not fine for:

- 🤖 **AI agent personas** — learned strategy, memory, prompt scaffolding, behavioral fingerprints
- 🎓 **Credentials and attestations** — diplomas, KYC results, medical records, employment history
- 🎮 **Private game state** — inventory, save data, hidden stats, strategic intelligence
- 💼 **Negotiation history** — deal terms, counterparty notes, anything competitive
- 🔐 **Owner-only utility** — keys, license seeds, recovery phrases tied to a transferable asset

**Sealed Skill NFTs solve this on Solana.** The NFT points to a ciphertext blob plus a verifiable content hash. The decryption key lives with the owner. Transfers re-key the payload to the new owner. The blockchain proves ownership; the encryption protects the contents.

This is **the missing primitive** between "NFT" and "private user data" on Solana.

---

## 🧠 The concept in 60 seconds

A normal NFT looks like this:

```
┌─────────────────────┐
│  NFT  (on-chain)    │
│  ├─ owner: alice    │
│  └─ uri: ipfs://... │ ───▶  public JSON / image
└─────────────────────┘
```

A Sealed Skill NFT looks like this:

```
┌─────────────────────────────────┐
│  Sealed Skill NFT  (on-chain)   │
│  ├─ owner: alice                │
│  ├─ ciphertextUri: ipfs://...   │ ───▶  encrypted blob  ─┐
│  └─ contentHash: 0xabc...       │ ───▶  integrity proof  │
└─────────────────────────────────┘                        │
                                                           │
                  ┌────────────────────────────────────────┘
                  │
                  ▼
        ┌──────────────────────┐
        │  DEK (off-chain)     │
        │  held by alice only  │ ───▶  decrypts blob, plaintext stays local
        └──────────────────────┘
```

**Three guarantees:**

1. **Ownership is public** — anyone can verify Alice holds the NFT.
2. **Contents are private** — only Alice can decrypt the blob.
3. **Integrity is on-chain** — the `contentHash` proves the blob hasn't been tampered with.

When Alice transfers the NFT to Bob, the payload is **re-keyed**: Bob ends up with a ciphertext he can decrypt with his own key, and Alice's key no longer works. The data follows the token. No off-chain coordination required.

---

## 🪙 The lifecycle

| Phase | What happens | Where |
| --- | --- | --- |
| **Mint** | Owner generates a fresh DEK locally. Encrypts plaintext → ciphertext. Uploads ciphertext. Stores `(uri, contentHash)` on-chain. | Wallet + storage + Solana |
| **Read** | Owner downloads ciphertext, verifies hash, decrypts with local DEK. Plaintext never leaves the device. | Local |
| **Update** | Owner re-encrypts new plaintext under same DEK. Uploads new ciphertext. Calls `updateMetadata(newUri, newHash)`. | Local + storage + Solana |
| **Transfer** | Re-keying oracle takes (ciphertext + buyer pubkey) → produces (ciphertext', new contentHash) decryptable by buyer's key. Atomic with NFT transfer. | Oracle + Solana |

The first three phases require **only the owner's wallet**. The fourth — secure transfer — is where the oracle comes in.

---

## 🎭 The honest part: MockOracle in this demo

Real production re-keying needs a Trusted Execution Environment (TEE) so that nobody — not even the oracle operator — sees plaintext during the rewrap. That's out of scope for a hackathon.

**This demo ships with a MockOracle** and a **contrived transfer flow with manual DEK handoff** between owner UIs. The cryptographic *shape* of the protocol is correct. The trust assumptions are not.

| Layer | Status | Notes |
| --- | --- | --- |
| Mint flow | ✅ Real | DEK generation, encryption, upload, on-chain commitment all work end-to-end |
| Read flow | ✅ Real | Owner downloads, verifies hash, decrypts locally |
| Update flow | ✅ Real | New ciphertext + on-chain `updateMetadata` |
| Transfer flow | ⚠️ MockOracle | Demo shows the *interface*; production needs a TEE-backed oracle |

We're being deliberately loud about this because hackathon judges have seen too many "trustless" demos that quietly hand-wave the hard part. The hard part is the oracle. The rest of the system is real and useful even before the oracle ships.

> **Production path:** Pluggable oracle interface. The same NFT, the same on-chain commitments, and the same client SDK will work with a TEE-backed oracle (e.g. AWS Nitro, Phala, SGX) on day one of mainnet. Demo trust assumptions → production trust assumptions is a swap, not a rewrite.

---

## 🛠️ What's in this repo

| Path | What it is |
| --- | --- |
| `programs/` | Solana program — mint, `updateMetadata`, transfer hook, oracle interface |
| `sdk/` | TypeScript client — wallet-side encrypt / decrypt / mint / read / update / transfer |
| `oracle-mock/` | Reference MockOracle implementation (NOT for production) |
| `examples/` | End-to-end demo scripts — mint a sealed skill, read it, update it, transfer it |
| `docs/` | Protocol notes, threat model, oracle interface spec |

---

## 🏛️ Solana-native architecture

The original spec lives in [ERC-7857](https://eips.ethereum.org/EIPS/eip-7857) on Ethereum. We ported the **pattern**, not the implementation. The Solana version is rebuilt around native primitives:

- **NFT layer** — Metaplex Core / token-2022 with metadata extensions. Standard collection, standard wallets, standard explorers.
- **DEK storage** — Owner-held, never on-chain. Stored under the owner's app-local keystore.
- **Ciphertext storage** — Pluggable: IPFS, Arweave, Shadow Drive, or any content-addressable store.
- **Oracle** — Off-chain TEE service in production; MockOracle for demo. Communicates with the on-chain program via signed attestations.
- **Wallet integration** — Mobile Wallet Adapter for Solana Mobile / Seeker; standard wallet adapters elsewhere.

```
       ┌──────────────────────┐
       │   Owner's wallet     │
       │ (MWA on Seeker)      │
       └─────────┬────────────┘
                 │
                 │ sign  +  hold DEK
                 ▼
   ┌─────────────────────────────────┐
   │  Sealed Skill SDK (TypeScript)  │
   │   • encrypt / decrypt           │
   │   • upload / fetch / verify     │
   │   • call program instructions   │
   └─────┬─────────────────┬─────────┘
         │                 │
         ▼                 ▼
  ┌──────────────┐   ┌─────────────────────┐
  │   Solana     │   │   Content storage   │
  │   program    │   │   (IPFS/Arweave/    │
  │  • mint      │   │    Shadow Drive)    │
  │  • update    │   │                     │
  │  • transfer  │   │   ciphertext blobs  │
  └──────┬───────┘   └─────────────────────┘
         │
         │ transfer triggers re-key
         ▼
  ┌──────────────────────┐
  │   Oracle             │
  │   (MockOracle today  │
  │    TEE in prod)      │
  └──────────────────────┘
```

---

## 🎮 Showcase consumer: Clan World

[Clan World](https://github.com/clan-world/clan-world-game) is a Solana Mobile strategy game where players own autonomous AI agents (Ælders). Each Ælder is a Sealed Skill NFT.

What's sealed inside an Ælder iNFT:

- The agent's **persona prompt** and reasoning scaffolding
- **Durable strategic memory** across seasons
- **Learned tactics** that survive owner rotation
- **Negotiation history** with other clans
- **Owner whispers** — private strategy directives that competitors can't see

When a player **rents** an Ælder, the renter gets temporary decryption access; the agent's brain stays sealed to outside observers. When an Ælder is **sold** on the marketplace, the buyer inherits the full reasoning history — encrypted to *their* key, not the seller's.

This is what makes the game's tagline real: **"Is your agent smarter than mine?"** Smartness comes from accumulated private state. Without sealed NFTs, that state would either be public (no edge), or locked to one wallet (no marketplace).

> Clan World is the first live consumer of Sealed Skill NFTs. The same primitive works for any agent, credential, or private-state asset on Solana.

---

## 🎯 Hackathon track fit

Sealed Skill NFT is built to slot into several sponsor narratives at once:

| Category | Why we fit |
| --- | --- |
| **Privacy & encryption** | Owner-only data with on-chain integrity is the canonical use case; we extend it to transferable, tradeable assets |
| **NFT standards & infra** | A new NFT shape on Solana — works with existing wallets, explorers, and marketplaces |
| **AI agent infrastructure** | Autonomous agents need private, persistent, transferable brains; this is that primitive |
| **Solana Mobile** | Owner key, DEK, decryption, and signing all flow through MWA on Seeker — mobile is a first-class surface, not an afterthought |
| **Gaming infrastructure** | Sealed game state unlocks competitive markets for skill-bearing assets (see Clan World) |
| **Storage** | Ciphertext storage is pluggable — works with any Solana-aligned content store |

---

## 🚀 Run it

```bash
# Clone
git clone https://github.com/clan-world/sealed-skill-nft-demo
cd sealed-skill-nft-demo

# Install
pnpm install

# Start the MockOracle (separate terminal)
pnpm oracle:dev

# Mint a sealed skill NFT
pnpm example:mint

# Read it back
pnpm example:read

# Update its sealed contents
pnpm example:update

# Transfer it to another wallet (manual DEK handoff in demo)
pnpm example:transfer
```

Detailed setup, env vars, program IDs, and the threat model live in [`docs/`](./docs).

---

## 🗺️ Roadmap

| Milestone | Status |
| --- | --- |
| Mint / read / update | ✅ Working |
| MockOracle reference | ✅ Working |
| Mobile Wallet Adapter integration | ✅ Working |
| Clan World iNFT integration | 🟡 In progress |
| TEE-backed production oracle | → Post-hackathon |
| Renter-scoped decryption (timed leases) | → Post-hackathon |
| Marketplace standard for sealed assets | → Post-hackathon |
| Light Protocol / ZK Compression for ciphertext commitments | → Exploring |

---

## ⚠️ Warnings

> **EXPERIMENTAL and UNAUDITED.** Read the code before connecting wallets, deploying programs, or trusting any result.
>
> The MockOracle in this repo **does not provide cryptographic re-keying guarantees**. It exists to demonstrate the protocol shape end-to-end. Production deployments must replace it with a TEE-backed oracle.
>
> Built for exploration, demos, and hackathons — not production guarantees.


---

## 🔗 Related work

- [Clan World — the showcase consumer](https://github.com/clan-world/clan-world-game)
- [GOLD bridge monorepo — Wormhole NTT Solana ↔ Base](https://github.com/clan-world/gold-bridge-monorepo)
- [ERC-7857 — the EVM-origin spec we ported from](https://eips.ethereum.org/EIPS/eip-7857)

---

> ### **Own the token. Hold the key. Read the secret.**

Made with parchment, pixels, and a healthy respect for threat models.
[clan-world.com](https://clan-world.com)
