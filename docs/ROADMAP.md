# Roadmap

## Phase 1 — Current MVP

- Mock TEE attestation.
- Real encryption and key wrapping.
- Solana devnet 1-supply demo NFT token.
- Runtime ownership checks.
- Signed transcripts.
- Single-screen visual demo.

## Phase 2 — Stronger Solana integration

- Replace the demo NFT token with Metaplex Core or Token-2022.
- Add Token-2022 Transfer Hook or Metaplex lifecycle validation.
- Move transfer authorization checks into the Solana program.
- Add on-chain TEE registry writes.

## Phase 3 — Real TEE attestation

- Deploy services in real enclave infrastructure.
- Bind public keys to enclave measurements.
- Add quote freshness checks.
- Add revocation and rotation.

## Phase 4 — Automata DCAP path

- Verify TEE quotes with Automata DCAP tooling.
- Add zkVM-compressed attestation proof flow.
- Store verified TEE keys in the Solana registry.

## Phase 5 — Real private AI runtime

- Replace animal sound mapping with approved model inference.
- Add prompt and output policies.
- Add leak budgets.
- Add runtime versioning.

## Phase 6 — Marketplace support

- Support normal NFT marketplace transfer paths.
- Keep key access bound to current owner and current epoch.
- Add transfer history, policy history, and public provenance.
