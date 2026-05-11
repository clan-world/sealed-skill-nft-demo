# Solana Program Helpers

The MVP UI uses Solana devnet SPL-token mint/transfer for speed.

The Anchor program in `programs/sealed-skill` is included as the future on-chain registry and verifier path.

To deploy it you need:

- Rust
- Solana CLI
- Anchor CLI

Then run:

```bash
infra/solana/deploy-localnet.sh
infra/solana/deploy-devnet.sh
```
