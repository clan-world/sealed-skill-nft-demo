import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  clusterApiUrl,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import {
  AuthorityType,
  ExtensionType,
  ExtraAccountMetaAccountDataLayout,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_GROUP_MEMBER_SIZE,
  TOKEN_GROUP_SIZE,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeGroupInstruction,
  createInitializeGroupMemberPointerInstruction,
  createInitializeGroupPointerInstruction,
  createInitializeInstruction,
  createInitializeMemberInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMint2Instruction,
  createInitializeTransferHookInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMintLen
} from '@solana/spl-token';

const TOKEN_METADATA_BYTES = 1024;
const SEALED_SKILL_PROGRAM_ID = new PublicKey('APpCcBAPBAn92mz8KLv3RgFTqLKHMyMAvepudiUpNb6s');
const ANCHOR_EVENT_AUTHORITY = new PublicKey('11111111111111111111111111111111');

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

export interface Token2022CollectibleMintInput {
  connection: Connection;
  payer: Keypair;
  owner: PublicKey;
  collectionStatePath: string;
  metadataBaseUrl: string;
  hookProgramId?: PublicKey;
  artifactId: string;
  encryptedBlobHash: string;
  runtimePolicyHash: string;
}

export interface Token2022CollectibleMintResult {
  mint: PublicKey;
  collectionMint: PublicKey;
  signature: string;
  metadataUri: string;
  tokenProgram: PublicKey;
  hookProgramId: PublicKey;
  artifactPda: PublicKey;
  approvalPda: PublicKey;
}

export function getSealedSkillProgramId(value?: string): PublicKey {
  return value ? new PublicKey(value) : SEALED_SKILL_PROGRAM_ID;
}

export function deriveArtifactPda(mint: PublicKey, programId = SEALED_SKILL_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('artifact'), mint.toBuffer()], programId)[0];
}

export function deriveApprovalPda(mint: PublicKey, programId = SEALED_SKILL_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('approval'), mint.toBuffer()], programId)[0];
}

export function deriveConfigPda(programId = SEALED_SKILL_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('config')], programId)[0];
}

export function deriveExtraAccountMetasPda(mint: PublicKey, programId = SEALED_SKILL_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('extra-account-metas'), mint.toBuffer()], programId)[0];
}

export async function mintOneSupplyDemoNft(input: Token2022CollectibleMintInput): Promise<Token2022CollectibleMintResult> {
  return mintOneSupplyToken2022Collectible(input);
}

export async function mintOneSupplyToken2022Collectible(input: Token2022CollectibleMintInput): Promise<Token2022CollectibleMintResult> {
  const { connection, payer, owner } = input;
  const hookProgramId = input.hookProgramId ?? SEALED_SKILL_PROGRAM_ID;
  const collectionMint = await loadOrCreateCollectionMint({
    connection,
    payer,
    collectionStatePath: input.collectionStatePath,
    metadataBaseUrl: input.metadataBaseUrl
  });
  const mint = Keypair.generate();
  const metadataUri = makeMetadataUri(input.metadataBaseUrl, mint.publicKey);
  const artifactPda = deriveArtifactPda(mint.publicKey, hookProgramId);
  const approvalPda = deriveApprovalPda(mint.publicKey, hookProgramId);
  const mintLen = getMintLen(
    [ExtensionType.MetadataPointer, ExtensionType.GroupMemberPointer, ExtensionType.TransferHook]
  );
  const ata = await getAssociatedTokenAddress(mint.publicKey, owner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const rent = await connection.getMinimumBalanceForRentExemption(mintLen);
  const initTx = new Transaction();
  initTx.add(SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mint.publicKey,
    lamports: rent,
    space: mintLen,
    programId: TOKEN_2022_PROGRAM_ID
  }));
  initTx.add(createInitializeMetadataPointerInstruction(mint.publicKey, payer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID));
  initTx.add(createInitializeGroupMemberPointerInstruction(mint.publicKey, payer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID));
  initTx.add(createInitializeTransferHookInstruction(mint.publicKey, payer.publicKey, hookProgramId, TOKEN_2022_PROGRAM_ID));
  initTx.add(createInitializeMint2Instruction(mint.publicKey, 0, payer.publicKey, null, TOKEN_2022_PROGRAM_ID));
  initTx.add(SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: mint.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(TOKEN_METADATA_BYTES)
  }));
  initTx.add(createInitializeInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    metadata: mint.publicKey,
    updateAuthority: payer.publicKey,
    mint: mint.publicKey,
    mintAuthority: payer.publicKey,
    name: 'Sealed Skill NFT',
    symbol: 'SSNFT',
    uri: metadataUri
  }));
  initTx.add(SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: mint.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(TOKEN_GROUP_MEMBER_SIZE)
  }));
  initTx.add(createInitializeMemberInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    member: mint.publicKey,
    memberMint: mint.publicKey,
    memberMintAuthority: payer.publicKey,
    group: collectionMint,
    groupUpdateAuthority: payer.publicKey
  }));
  await sendAndConfirmTransaction(connection, initTx, [payer, mint], { commitment: 'confirmed' });

  const registerTx = new Transaction();
  registerTx.add(createRegisterArtifactInstruction({
    programId: hookProgramId,
    admin: payer.publicKey,
    mint: mint.publicKey,
    artifact: artifactPda,
    artifactIdHash: bytes32(input.artifactId),
    encryptedBlobHash: hex32(input.encryptedBlobHash),
    runtimePolicyHash: bytes32(input.runtimePolicyHash),
    owner
  }));
  registerTx.add(createInitializeExtraAccountMetasInstruction({
    programId: hookProgramId,
    admin: payer.publicKey,
    mint: mint.publicKey,
    extraAccountMetas: deriveExtraAccountMetasPda(mint.publicKey, hookProgramId),
    artifact: artifactPda,
    approval: approvalPda
  }));
  registerTx.add(createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, owner, mint.publicKey, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  registerTx.add(createMintToInstruction(mint.publicKey, ata, payer.publicKey, 1, [], TOKEN_2022_PROGRAM_ID));
  registerTx.add(createSetAuthorityInstruction(mint.publicKey, payer.publicKey, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID));
  const signature = await sendAndConfirmTransaction(connection, registerTx, [payer], { commitment: 'confirmed' });
  return {
    mint: mint.publicKey,
    collectionMint,
    signature,
    metadataUri,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    hookProgramId,
    artifactPda,
    approvalPda
  };
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
  hookProgramId?: PublicKey;
}): Promise<Transaction> {
  return buildToken2022BrokerTransferTx(input);
}

export async function buildToken2022BrokerTransferTx(input: {
  connection: Connection;
  mint: PublicKey;
  fromOwner: PublicKey;
  toOwner: PublicKey;
  hookProgramId?: PublicKey;
}): Promise<Transaction> {
  const { connection, mint, fromOwner, toOwner } = input;
  const hookProgramId = input.hookProgramId ?? SEALED_SKILL_PROGRAM_ID;
  const fromAta = await getAssociatedTokenAddress(mint, fromOwner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const toAta = await getAssociatedTokenAddress(mint, toOwner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const artifactPda = deriveArtifactPda(mint, hookProgramId);
  const approvalPda = deriveApprovalPda(mint, hookProgramId);
  const extraAccountMetasPda = deriveExtraAccountMetasPda(mint, hookProgramId);
  const tx = new Transaction();
  tx.add(createBeginBrokerTransferInstruction({ programId: hookProgramId, owner: fromOwner, mint, artifact: artifactPda, approval: approvalPda }));
  tx.add(createAssociatedTokenAccountIdempotentInstruction(fromOwner, toAta, toOwner, mint, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  const transferIx = createTransferCheckedInstruction(fromAta, mint, toAta, fromOwner, 1, 0, [], TOKEN_2022_PROGRAM_ID);
  transferIx.keys.push(
    { pubkey: artifactPda, isSigner: false, isWritable: true },
    { pubkey: approvalPda, isSigner: false, isWritable: true },
    { pubkey: hookProgramId, isSigner: false, isWritable: false },
    { pubkey: extraAccountMetasPda, isSigner: false, isWritable: false }
  );
  tx.add(transferIx);
  tx.feePayer = fromOwner;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  return tx;
}

export async function recordBrokerTransferApproval(input: {
  connection: Connection;
  payer: Keypair;
  mint: PublicKey;
  toOwner: PublicKey;
  capsuleHash: string;
  expiresAt: string;
  programId?: PublicKey;
}): Promise<{ signature: string; artifactPda: PublicKey; approvalPda: PublicKey }> {
  const programId = input.programId ?? SEALED_SKILL_PROGRAM_ID;
  const artifactPda = deriveArtifactPda(input.mint, programId);
  const approvalPda = deriveApprovalPda(input.mint, programId);
  const tx = new Transaction().add(createRecordTransferApprovalInstruction({
    programId,
    admin: input.payer.publicKey,
    mint: input.mint,
    config: deriveConfigPda(programId),
    artifact: artifactPda,
    approval: approvalPda,
    toOwner: input.toOwner,
    capsuleHash: hex32(input.capsuleHash),
    expiresAt: Math.floor(new Date(input.expiresAt).getTime() / 1000)
  }));
  const signature = await sendAndConfirmTransaction(input.connection, tx, [input.payer], { commitment: 'confirmed' });
  return { signature, artifactPda, approvalPda };
}

async function loadOrCreateCollectionMint(input: {
  connection: Connection;
  payer: Keypair;
  collectionStatePath: string;
  metadataBaseUrl: string;
}): Promise<PublicKey> {
  try {
    const existing = JSON.parse(await fs.readFile(input.collectionStatePath, 'utf8')) as { mint: string };
    const mint = new PublicKey(existing.mint);
    const account = await input.connection.getAccountInfo(mint);
    if (account) return mint;
  } catch {
    // Fall through and create a fresh collection mint.
  }

  const mint = Keypair.generate();
  const metadataUri = `${stripSlash(input.metadataBaseUrl)}/api/nft/collection-metadata`;
  const mintLen = getMintLen(
    [ExtensionType.MetadataPointer, ExtensionType.GroupPointer]
  );
  const rent = await input.connection.getMinimumBalanceForRentExemption(mintLen);
  const tx = new Transaction();
  tx.add(SystemProgram.createAccount({
    fromPubkey: input.payer.publicKey,
    newAccountPubkey: mint.publicKey,
    lamports: rent,
    space: mintLen,
    programId: TOKEN_2022_PROGRAM_ID
  }));
  tx.add(createInitializeMetadataPointerInstruction(mint.publicKey, input.payer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID));
  tx.add(createInitializeGroupPointerInstruction(mint.publicKey, input.payer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID));
  tx.add(createInitializeMint2Instruction(mint.publicKey, 0, input.payer.publicKey, null, TOKEN_2022_PROGRAM_ID));
  tx.add(SystemProgram.transfer({
    fromPubkey: input.payer.publicKey,
    toPubkey: mint.publicKey,
    lamports: await input.connection.getMinimumBalanceForRentExemption(TOKEN_METADATA_BYTES)
  }));
  tx.add(createInitializeInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    metadata: mint.publicKey,
    updateAuthority: input.payer.publicKey,
    mint: mint.publicKey,
    mintAuthority: input.payer.publicKey,
    name: 'Sealed Skill Collection',
    symbol: 'SSKILL',
    uri: metadataUri
  }));
  tx.add(SystemProgram.transfer({
    fromPubkey: input.payer.publicKey,
    toPubkey: mint.publicKey,
    lamports: await input.connection.getMinimumBalanceForRentExemption(TOKEN_GROUP_SIZE)
  }));
  tx.add(createInitializeGroupInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    group: mint.publicKey,
    mint: mint.publicKey,
    mintAuthority: input.payer.publicKey,
    updateAuthority: input.payer.publicKey,
    maxSize: BigInt(10_000)
  }));
  await sendAndConfirmTransaction(input.connection, tx, [input.payer, mint], { commitment: 'confirmed' });
  await fs.mkdir(path.dirname(input.collectionStatePath), { recursive: true });
  await fs.writeFile(input.collectionStatePath, JSON.stringify({ mint: mint.publicKey.toBase58(), metadataUri }, null, 2));
  return mint.publicKey;
}

function createRegisterArtifactInstruction(input: {
  programId: PublicKey;
  admin: PublicKey;
  mint: PublicKey;
  artifact: PublicKey;
  artifactIdHash: Uint8Array;
  encryptedBlobHash: Uint8Array;
  runtimePolicyHash: Uint8Array;
  owner: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: input.programId,
    keys: [
      { pubkey: input.admin, isSigner: true, isWritable: true },
      { pubkey: deriveConfigPda(input.programId), isSigner: false, isWritable: true },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: input.artifact, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ANCHOR_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: input.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([
      anchorDiscriminator('global:register_minted_artifact'),
      Buffer.from(input.artifactIdHash),
      Buffer.from(input.encryptedBlobHash),
      Buffer.from(input.runtimePolicyHash),
      input.owner.toBuffer()
    ])
  });
}

function createRecordTransferApprovalInstruction(input: {
  programId: PublicKey;
  admin: PublicKey;
  config: PublicKey;
  mint: PublicKey;
  artifact: PublicKey;
  approval: PublicKey;
  toOwner: PublicKey;
  capsuleHash: Uint8Array;
  expiresAt: number;
}): TransactionInstruction {
  const expires = Buffer.alloc(8);
  expires.writeBigInt64LE(BigInt(input.expiresAt));
  return new TransactionInstruction({
    programId: input.programId,
    keys: [
      { pubkey: input.admin, isSigner: true, isWritable: true },
      { pubkey: input.config, isSigner: false, isWritable: false },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: input.artifact, isSigner: false, isWritable: true },
      { pubkey: input.approval, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([
      anchorDiscriminator('global:record_transfer_approval'),
      input.toOwner.toBuffer(),
      Buffer.from(input.capsuleHash),
      expires
    ])
  });
}

function createBeginBrokerTransferInstruction(input: {
  programId: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  artifact: PublicKey;
  approval: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: input.programId,
    keys: [
      { pubkey: input.owner, isSigner: true, isWritable: false },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: input.artifact, isSigner: false, isWritable: true },
      { pubkey: input.approval, isSigner: false, isWritable: true }
    ],
    data: anchorDiscriminator('global:begin_broker_transfer')
  });
}

function createInitializeExtraAccountMetasInstruction(input: {
  programId: PublicKey;
  admin: PublicKey;
  mint: PublicKey;
  extraAccountMetas: PublicKey;
  artifact: PublicKey;
  approval: PublicKey;
}): TransactionInstruction {
  const data = encodeExtraAccountMetas([input.artifact, input.approval]);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.length);
  return new TransactionInstruction({
    programId: input.programId,
    keys: [
      { pubkey: input.admin, isSigner: true, isWritable: true },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: input.extraAccountMetas, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([
      anchorDiscriminator('global:initialize_extra_account_metas'),
      len,
      data
    ])
  });
}

function encodeExtraAccountMetas(accounts: PublicKey[]): Buffer {
  const accountData = {
    instructionDiscriminator: 1902484195463472489n,
    length: 4 + accounts.length * 35,
    extraAccountsList: {
      count: accounts.length,
      extraAccounts: accounts.map((account) => ({
        discriminator: 0,
        addressConfig: account.toBuffer(),
        isSigner: false,
        isWritable: true
      }))
    }
  };
  const buffer = Buffer.alloc(12 + accountData.length);
  ExtraAccountMetaAccountDataLayout.encode(accountData, buffer);
  return buffer;
}

function makeMetadataUri(baseUrl: string, mint: PublicKey): string {
  return `${stripSlash(baseUrl)}/api/nft/metadata/${mint.toBase58()}`;
}

function stripSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function anchorDiscriminator(name: string): Buffer {
  return createHash('sha256').update(name).digest().subarray(0, 8);
}

function bytes32(value: string): Uint8Array {
  return createHash('sha256').update(value).digest();
}

function hex32(value: string): Uint8Array {
  const clean = value.replace(/^0x/, '');
  if (/^[0-9a-fA-F]{64}$/.test(clean)) return Uint8Array.from(Buffer.from(clean, 'hex'));
  return bytes32(value);
}
