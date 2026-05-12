import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync
} from '@solana/spl-token';
import {
  deriveApprovalPda,
  deriveArtifactPda,
  deriveExtraAccountMetasPda,
  getSealedSkillProgramId
} from '../src/index.js';

const [secretBase58, toAddress, mintArg] = process.argv.slice(2);

if (!secretBase58 || !toAddress) {
  throw new Error('usage: pnpm --filter @sealed-skill/solana exec tsx scripts/submit-normal-transfer-skip-preflight.ts <base58-secret-key> <to-address> [mint]');
}

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, '../../..');
const demoState = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/api/data/demo-state.json'), 'utf8')) as {
  artifact?: { nftMint?: string; hookProgramId?: string };
};

const connection = new Connection(process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed');
const owner = Keypair.fromSecretKey(decodeBase58(secretBase58));
const toOwner = new PublicKey(toAddress);
const mint = new PublicKey(mintArg ?? demoState.artifact?.nftMint ?? '');
const hookProgramId = getSealedSkillProgramId(demoState.artifact?.hookProgramId);

const fromAta = getAssociatedTokenAddressSync(mint, owner.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
const toAta = getAssociatedTokenAddressSync(mint, toOwner, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
const artifactPda = deriveArtifactPda(mint, hookProgramId);
const approvalPda = deriveApprovalPda(mint, hookProgramId);
const extraAccountMetasPda = deriveExtraAccountMetasPda(mint, hookProgramId);

const latest = await connection.getLatestBlockhash('confirmed');
const tx = new Transaction({
  feePayer: owner.publicKey,
  blockhash: latest.blockhash,
  lastValidBlockHeight: latest.lastValidBlockHeight
});

tx.add(createAssociatedTokenAccountIdempotentInstruction(
  owner.publicKey,
  toAta,
  toOwner,
  mint,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
));

const transferIx = createTransferCheckedInstruction(
  fromAta,
  mint,
  toAta,
  owner.publicKey,
  1,
  0,
  [],
  TOKEN_2022_PROGRAM_ID
);
transferIx.keys.push(
  { pubkey: extraAccountMetasPda, isSigner: false, isWritable: false },
  { pubkey: artifactPda, isSigner: false, isWritable: true },
  { pubkey: approvalPda, isSigner: false, isWritable: true },
  { pubkey: hookProgramId, isSigner: false, isWritable: false }
);
tx.add(transferIx);
tx.sign(owner);

const signature = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: true,
  maxRetries: 0
});

console.log(`owner=${owner.publicKey.toBase58()}`);
console.log(`mint=${mint.toBase58()}`);
console.log(`to=${toOwner.toBase58()}`);
console.log(`signature=${signature}`);
console.log(`explorer=https://explorer.solana.com/tx/${signature}?cluster=devnet`);

const confirmation = await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
console.log(`confirmedErr=${JSON.stringify(confirmation.value.err)}`);

const txDetails = await connection.getTransaction(signature, {
  commitment: 'confirmed',
  maxSupportedTransactionVersion: 0
});
console.log(`logs=${JSON.stringify(txDetails?.meta?.logMessages ?? [])}`);

function decodeBase58(value: string): Uint8Array {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = [0];
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error(`invalid base58 character: ${char}`);
    let carry = digit;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char !== '1') break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}
