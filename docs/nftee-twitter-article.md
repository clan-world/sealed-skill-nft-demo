# What Is an NFTee?

Most digital assets live in one of two categories:

1. Public and ownable.
2. Private but not really transferable.

NFTs solved part of the first category. They made public digital objects easy to own, transfer, display, and trade.

But they did not solve the second category.

If an NFT points to public metadata, everyone can read it. That is fine for art, collectibles, and many game items.

It is not fine for AI agents, private game state, strategy, memory, credentials, learned behavior, sealed prompts, or any asset whose value depends on information staying private.

And if you simply encrypt the data and give the owner the decryption key, you run into the old digital scarcity problem:

The owner can copy the data before selling the token.

That is the copy-before-sale problem.

Alice owns an NFT with private data. Alice decrypts it. Alice sells the NFT to Bob. Alice still has the data.

The token moved. The secret did not.

So the market cannot know whether Bob owns the scarce thing, or only the receipt for a thing Alice may have already copied.

This is the problem NFTee is trying to solve.

An NFTee is not just "private NFT metadata."

It is an attempt to create a third category:

**Publicly ownable, privately usable, transferable digital capability.**

Or more simply:

**A scarce token that controls access to a sealed capability.**

The NFTee does not contain the secret.

The NFTee controls who can use the secret.

That distinction matters.

In the NFTee model, the owner does not necessarily receive the raw plaintext, the raw model state, the raw prompt, the private key, the memory file, or the hidden game strategy.

Instead, the owner receives the right to ask an approved runtime to use that sealed data under a policy.

The secret can act.

The secret can answer.

The secret can evolve.

The secret can be transferred to a new owner.

But the current owner cannot trivially copy it and walk away.

That is the honest framing.

The NFTee is not saying: "Only the owner can read this data."

It is saying something stronger and, I think, more interesting:

**Only the owner can use this data, and even the owner does not get to extract it.**

That is the primitive.

The architecture is basically:

- A public blockchain proves who owns the NFTee.
- External storage holds only encrypted blobs.
- A broker controls access to the artifact key.
- A runtime uses the secret internally and returns only allowed outputs.
- On-chain state tracks ownership, policy, hashes, nonces, and epochs.

The NFT is the transferable control right.

The encrypted blob is the sealed memory or artifact.

The broker is the key authority.

The runtime is the execution boundary.

The chain is the ownership and settlement layer.

This makes the asset more like a sealed capability than a file.

For example, imagine an autonomous game agent.

What makes that agent valuable?

Not just its public image.

Its value might come from private memories, training history, strategy, preferences, weaknesses, alliances, learned playstyle, or hidden stats.

If the owner can download all of that before selling the agent, then the "scarce agent" is not actually scarce.

But if the owner can only ask approved runtimes to use the agent's sealed state, then the agent's private capability can move with the NFT.

Alice can use the agent while she owns it.

Bob can use it after he buys it.

Alice loses access after transfer.

Neither Alice nor Bob receives a clean copy of the underlying sealed state.

That is a much better model for AI agents and game assets than "encrypted metadata that the owner decrypts locally."

The goal is not secrecy for its own sake.

The goal is transferable, scarce, private utility.

This applies beyond games:

- AI agent personalities and memories
- private credentials
- paid software capabilities
- encrypted strategy or negotiation history
- owner-gated model adapters
- sealed licenses
- private game inventory or progression
- autonomous agents with hidden state

In each case, the question is not merely "can we hide the data?"

The better question is:

**Can ownership of the right to use the data move without leaking the data itself?**

That is where TEEs, threshold key networks, confidential compute, and policy-gated runtimes become interesting.

The system needs a place where secrets can be used without being revealed to the user, the server operator, or the public chain.

In one design, a TEE broker holds or can access the artifact key. It only releases a temporary session-wrapped key to an approved runtime, after checking ownership, policy, epoch, expiry, and nonce.

The runtime decrypts inside a protected environment, applies the output policy, and returns only what the owner is allowed to learn.

For transfer, the broker can issue a short-lived signed capsule:

This artifact may move from Alice to Bob, for this NFT mint, at this epoch, before this expiry.

The chain can enforce that capsule through a transfer hook or registry rule.

After transfer, the epoch changes. Old approvals die. Alice's old access no longer matches current ownership.

This model is not magic. It has trust assumptions.

If the TEE is compromised, secrets may leak.

If an approved runtime is malicious, it can leak the secret.

If the output policy is too permissive, users can infer the secret over time.

If the broker disappears, the asset may need recovery or migration rules.

Those are real problems.

But they are the right problems.

They are protocol design problems around attestation, governance, runtime permissioning, escape hatches, key rotation, and verifiable code.

They are not the unsolved contradiction of "I gave Alice the data but somehow she cannot copy it."

That is why I like the honest framing.

An NFTee should not pretend that plaintext ownership is scarce.

Plaintext is not scarce once revealed.

Instead, an NFTee treats ownership as controlled access to computation over sealed state.

That is a different kind of digital property.

Not "own the image."

Not "own the metadata."

Not even "own the secret."

More like:

**Own the right to activate a sealed intelligence.**

Or:

**Own the right to use private state that you cannot extract.**

That is the third category I keep coming back to:

1. Public and ownable.
2. Private but not transferable.
3. Private, usable, and transferable without revealing the underlying secret.

The third category is where NFTee lives.

And if it works, it changes what an NFT can be.

Not a pointer to media.

Not a receipt for metadata.

Not a speculative wrapper around a public file.

But a control surface for scarce private capability.

That is the thing I am excited about.

The future of NFTs may not be "here is a JPEG I own."

It may be:

**Here is a sealed agent only I can command.**

And when I sell it, the command right moves.

The mind does not leak.
