## Beat 2 — Transition to Vellum (0:30-0:40)


What you just saw runs thanks to a new solana primitive we built for Vellum
called an NFTee.

NFTee's enable encrypted, private data, like AI agent intelligence, become a transferable, ownable, and provably scarce asset. 

Let me walk you through a demo of the tech.

---

Today we are demoing with three mock Trusted Execution Environments, or TEEs. In production, these would be programs running inside Intel SGX or TDX or AWS Nitro secure enclaves. These enable cryptographically private compute and verified program execution.
Each TEE publishes a public key

this allows anyone passing data into the TEE to encrypt inputs so that even the hardware owner cannot see what information you pass in.

TEE 1 is the Transfer Broker and is the most important piece that makes the system work. I'll explain it momentarily.

TEE 2 & 3 enable our simple demo. We will show you how private data can be generated and encrypted inside one TEE, and then later transferred and consumed, without ever exposing it outside of a secure Trusted Execution Environment.

---

I'll start by generating a secret artifact. In this simple demo, TEE2 will:
- generate a symmetric encryption key
- generate some unique data - in this case a random animal name
- encrypts the data using the symmetric key
- encrypt, or seal, that key using the public key from the Transfer Broker
- and finally return the sealed encryption key and encrypted data

Finally an NFTee is minted to the connected Solana wallet.

Nobody — not me, not the user, not Vellum nor the hardward operator, AWS or Google — ever sees the plaintext data or encryption key. The intelligence is created sealed, and it stays sealed."

---

As the holder of the NFTee, I am able to use the encrypted data inside TEE3.

In this simple demo, TEE3 answers the question "what sound does this animal make?"

ROAR - I'm guessing it must be a lion or tiger. Maybe a Ligar?
We can never know...

Cool! But it get's cooler.

You'll see if I try to transfer this NFT from my wallet...
it failed!
the Token-2022 hook blocks a transfer without us first generating some extra information from our Transfer Broker.

---


I'll input our recipient's wallet address
then TEE1 verifies the current holder 
uses it's private key unseal the symmetric encryption key (remember TEE2 used #1's public key to seal this when we started)
then generates an owner-bound transfer capsule which get's bound to the recipient's address.

---

Finally, using the output form TEE1 we are able to transfer out NFTee!
In this demo, the token-2022 program verifies the signed TEE transfer capsule, on chain before allowing the asset to be transfered.

In production, that broker key can be registered through DCAP or zkVM-compressed attestation.

---

Now... If I try to request TEE3 to use the data again 
from this wallet, it fails!

---

Wallet A is now holding the NFTee. 
If we request TEE3 to tell us the sound again...

The Runtime requests a session key from the Broker, 
decrypts the artifact internally, 
and returns only the allowed output — 'ROAR.'

We just transferred an NFTee and it worked as expected,
But notice what *didn't* happen — 
the encrypted artifact never moved,
the encryption key never rotated.
Only the "right to invoke" changed hands.


Wallet A never saw the artifact itself. 
The NFT is not the secret. The NFT is the right to use the secret.

---

NFTee makes a sealed AI capability transferable and scarce under the TEE trust model: one canonical token controls one sealed artifact, and the plaintext is never delivered to the owner.

---

## Beat 8 — Tie back to Clan World (2:30-2:55)

**Speaker:** Mikail

**Footage**

Crossfade from the Vellum demo back to Clan World footage. Specifically:
- Cut to the Bazaar in Clan World, showing an Elder listed for sale or rent with ELO and traits visible
- Then cut to the cockpit one more time with an agent acting

**Voiceover**

> "What you just saw is what makes everything in Clan World possible. The animal becomes an agent's strategy. The 'quack' becomes a move in a season. The transfer becomes an Elder changing hands in the Bazaar. Vellum is the protocol. Clan World is the proof. The agents are here, and we're building the layer they need to actually be owned."

**Notes**

- 60 words, ~17 seconds at conversational pace
- The metaphor mapping ("animal → strategy, quack → move, transfer → Bazaar") is the explicit bridge. It connects the toy demo to the consumer product without claiming integration that doesn't exist yet
- Closing line echoes the pitch video closer — gives the two videos a coherent voice across submissions

---

## Beat 9 — End card (2:55-3:00)

**Footage**

Static Vellum closing slide: ink-on-parchment, Vellum wordmark, tagline *Controlled computation over private data. On Solana.* Hold for 5 seconds.

**No voiceover.**

---

## Total

- Voiceover words: ~437
- Reading time at conversational pace: ~2:55
- Hard end: 3:00

## Safe cuts if running long

In priority order, cut these first if the edit comes in over 3:00:

1. Trim Beat 1 by ~5 seconds: remove the "trade, raid, negotiate, betray" list
2. Trim Beat 6 by ~3 seconds: remove "the encryption key never rotated"

**Do not trim:**
- Beat 4 (the "nobody sees the plaintext" line) — load-bearing
- Beat 8 (the metaphor mapping) — load-bearing

---

## Production checklist

In strict order, because some items gate others:

1. **Confirm the Vellum demo records cleanly end-to-end on devnet** (15 min)
   - Mint flow works
   - Wallet B access denied state works visually
   - Transfer flow works on-chain
   - Wallet B access allowed state works and shows "quack"
   - If anything is broken, fix it before recording

2. **Mikail records voiceover for Beats 1 and 8** (20 min including retakes)
   - Total spoken time: ~44 seconds
   - Three takes each, pick the best

3. **Liam records the Vellum demo with adapted voiceover** (45 min)
   - Screen recording active throughout
   - Aim for one continuous take per beat
   - If you stumble mid-beat, restart from the beginning of that beat (don't splice mid-beat)

4. **Pull existing Clan World cockpit and Bazaar footage** (15 min)
   - From previous Solana Mobile recordings if usable
   - Otherwise record fresh — needs to show an agent visibly making a decision

5. **Editing pass** (30 min)
   - Crossfades at Beat 1→2 and Beat 7→8
   - Voiceover-over-footage at Beats 1 and 8
   - Closing Vellum slide
   - Audio leveling between speakers

6. **Buffer** (15 min)
   - Something will go wrong, don't plan 2 hours of work into 2 hours of time

---

## Questions for Liam before recording

1. Does the Vellum demo record cleanly end-to-end on devnet right now?
2. Is the "Mock TEE" indicator visible in the UI, or do we need to add it?
3. Does the UI show ciphertext explicitly during the Creator TEE animation, or do we need to add a hex blob visual?
4. Does the ACCESS DENIED state have a clear visual treatment (red, shake, prominent error card)?
5. Can the UI show a "Storage: unchanged" indicator during the transfer animation?
6. Is the "quack" output displayed in a clear callout or success card?

If any of these are missing, decide before recording whether to add them (worth it if cheap), live without them (acceptable if the voiceover compensates), or note them as roadmap items.
