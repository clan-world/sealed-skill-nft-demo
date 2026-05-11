# Demo Script

Use this when presenting the project.

## Opening

“This is a Solana NFT that controls a secret generated inside a TEE-like service. The owner can use the secret, but cannot copy it.”

## Step 1 — Register TEEs

Show the three boxes:

- Broker TEE.
- Creator TEE.
- Runtime TEE.

Say:

“Today these are mock-attested services. The interface is built so real attestation can replace the mock later.”

## Step 2 — Generate artifact

Click the generate button.

Say:

“The creator chooses an animal, encrypts it, stores only ciphertext, and mints a Solana demo NFT to Wallet A.”

## Step 3 — B fails

Click B tries before transfer.

Say:

“Wallet B can sign a request, but the runtime checks ownership and refuses.”

## Step 4 — Transfer

Click prepare transfer, then complete transfer.

Say:

“The broker creates a transfer capsule. Wallet A signs the Solana transfer. Ownership moves to B.”

## Step 5 — B succeeds

Click B asks runtime.

Say:

“Now Wallet B owns the NFT. The runtime asks the broker for a session key, decrypts the animal internally, and returns only the allowed output.”

## Close

“The NFT is not the secret. The NFT is a transferable control right over a secret that only approved runtimes can use.”
