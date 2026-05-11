import fs from 'node:fs/promises';
import path from 'node:path';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  clusterApiUrl
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';

export function makeConnection(rpcUrl?: string): Connection {
  return new Connection(rpcUrl || clusterApiUrl('devnet'), 'confirmed');
}

export async function loadOrCreateKeypair(file: string): Promise<Keypair> {
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const kp = Keypair.generate();
    await fs.writeFile(file, JSON.stringify(Array.from(kp.secretKey), null, 2));
    return kp;
  }
}

export async function requestDevnetAirdrop(connection: Connection, keypair: Keypair, sol = 2): Promise<string> {
  const sig = await connection.requestAirdrop(keypair.publicKey, sol * 1_000_000_000);
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

export async function mintOneSupplyDemoNft(input: {
  connection: Connection;
  payer: Keypair;
  owner: PublicKey;
}): Promise<{ mint: PublicKey; signature: string }> {
  const { connection, payer, owner } = input;
  const mint = Keypair.generate();
  const ata = await getAssociatedTokenAddress(mint.publicKey, owner);
  const rent = await getMinimumBalanceForRentExemptMint(connection);
  const tx = new Transaction();
  tx.add(SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mint.publicKey,
    lamports: rent,
    space: MINT_SIZE,
    programId: TOKEN_PROGRAM_ID
  }));
  tx.add(createInitializeMint2Instruction(mint.publicKey, 0, payer.publicKey, null));
  tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint.publicKey));
  tx.add(createMintToInstruction(mint.publicKey, ata, payer.publicKey, 1));
  const sig = await connection.sendTransaction(tx, [payer, mint], { preflightCommitment: 'confirmed' });
  await connection.confirmTransaction(sig, 'confirmed');
  return { mint: mint.publicKey, signature: sig };
}

export async function getCurrentDemoNftOwner(connection: Connection, mint: PublicKey): Promise<PublicKey | null> {
  const largest = await connection.getTokenLargestAccounts(mint);
  const holder = largest.value.find((entry) => entry.uiAmount === 1 || entry.amount === '1');
  if (!holder) return null;
  const accountInfo = await connection.getParsedAccountInfo(holder.address);
  const parsed = accountInfo.value?.data && 'parsed' in accountInfo.value.data ? accountInfo.value.data.parsed as any : null;
  const owner = parsed?.info?.owner;
  return owner ? new PublicKey(owner) : null;
}

export async function buildDemoNftTransferTx(input: {
  connection: Connection;
  mint: PublicKey;
  fromOwner: PublicKey;
  toOwner: PublicKey;
}): Promise<Transaction> {
  const { connection, mint, fromOwner, toOwner } = input;
  const fromAta = await getAssociatedTokenAddress(mint, fromOwner);
  const toAta = await getAssociatedTokenAddress(mint, toOwner);
  const tx = new Transaction();
  const toInfo = await connection.getAccountInfo(toAta);
  if (!toInfo) {
    tx.add(createAssociatedTokenAccountInstruction(fromOwner, toAta, toOwner, mint));
  }
  tx.add(createTransferCheckedInstruction(fromAta, mint, toAta, fromOwner, 1, 0));
  tx.feePayer = fromOwner;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  return tx;
}
