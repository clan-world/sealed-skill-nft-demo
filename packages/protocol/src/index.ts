import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export type TeeRole = 'broker' | 'creator' | 'runtime';
export type AttestationMode = 'mock' | 'automata-dcap' | 'zk-compressed-dcap';
export type TransferPolicy = 'broker-gated' | 'open';

export interface TeeRecord {
  role: TeeRole;
  serviceUrl: string;
  signPublicKeyPem: string;
  wrapPublicKeyPem: string;
  measurement: string;
  attestationMode: AttestationMode;
  attestation: unknown;
  expiresAt: string;
  revoked: boolean;
}

export interface WrappedSecret {
  alg: 'X25519-HKDF-SHA256-AES-256-GCM';
  recipientPublicKeyPem: string;
  ephemeralPublicKeyPem: string;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
  tagB64: string;
  aadHash: string;
}

export interface EncryptedBlobRef {
  uri: string;
  sha256: string;
  bytes: number;
  encryption: 'AES-256-GCM';
  ivB64: string;
  tagB64: string;
  aadHash: string;
}

export interface RuntimePolicy {
  policyId: string;
  allowedPrompt: string;
  allowedOutput: 'animal-sound';
  runtimeMeasurement: string;
  runtimeSignPublicKeyPem: string;
  maxOutputChars: number;
}

export interface ArtifactRecord {
  artifactId: string;
  createdAt: string;
  creatorMeasurement: string;
  ownerPublicKey: string;
  nftMint?: string;
  collectionMint?: string;
  tokenProgram?: string;
  metadataUri?: string;
  hookProgramId?: string;
  artifactPda?: string;
  approvalPda?: string;
  transferPolicyPda?: string;
  transferPolicy: TransferPolicy;
  encryptedBlob: EncryptedBlobRef;
  sealedKeyForBroker: WrappedSecret;
  runtimePolicy: RuntimePolicy;
  epoch: number;
  status: 'created' | 'minted' | 'transferred';
}

export interface SignedEnvelope<T> {
  payload: T;
  signerPublicKeyPem: string;
  signatureB64: string;
  payloadHash: string;
}

export interface CreationTranscript {
  kind: 'creation';
  artifactId: string;
  prompt: string;
  ownerPublicKey: string;
  encryptedBlobHash: string;
  sealedKeyHash: string;
  runtimePolicyHash: string;
  creatorMeasurement: string;
  nonce: string;
  createdAt: string;
}

export interface TransferTranscript {
  kind: 'transfer';
  artifactId: string;
  nftMint: string;
  fromOwner: string;
  toOwner: string;
  epoch: number;
  nextEpoch: number;
  runtimePolicyHash: string;
  nonce: string;
  expiresAt: string;
}

export interface AccessCapsule {
  artifactId: string;
  nftMint: string;
  ownerPublicKey: string;
  epoch: number;
  runtimePolicyHash: string;
  nonce: string;
  expiresAt: string;
}

export interface RuntimeRequestPayload {
  kind: 'runtime-request';
  artifactId: string;
  nftMint: string;
  callerPublicKey: string;
  prompt: string;
  epoch: number;
  nonce: string;
  expiresAt: string;
}

export interface RuntimeTranscript {
  kind: 'runtime-result';
  artifactId: string;
  nftMint: string;
  callerPublicKey: string;
  promptHash: string;
  outputHash: string;
  encryptedBlobHash: string;
  epoch: number;
  runtimeMeasurement: string;
  nonce: string;
  createdAt: string;
}

export interface DemoState {
  tees: Partial<Record<TeeRole, TeeRecord>>;
  artifact?: ArtifactRecord;
  creationTranscript?: SignedEnvelope<CreationTranscript>;
  transferTranscript?: SignedEnvelope<TransferTranscript>;
  currentOwner?: string;
  pendingTransferTo?: string;
  lastRuntimeResult?: {
    output: string;
    transcript: SignedEnvelope<RuntimeTranscript>;
  };
  log: string[];
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortForJson(value));
}

function sortForJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortForJson);
  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    const v = input[key];
    if (typeof v !== 'undefined') out[key] = sortForJson(v);
  }
  return out;
}

export function sha256Hex(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return bytesToHex(sha256(bytes));
}

export function hashJson(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export function shortHash(value: string, len = 10): string {
  if (!value) return '';
  return value.length <= len ? value : `${value.slice(0, len)}…`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutesIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function isExpired(iso: string, now = new Date()): boolean {
  return new Date(iso).getTime() <= now.getTime();
}

export function makeNonce(prefix = 'nonce'): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `${prefix}_${bytesToHex(bytes).slice(0, 24)}`;
}

export const ANIMAL_SOUNDS: Record<string, string> = {
  duck: 'quack',
  dog: 'woof',
  cow: 'moo',
  cat: 'meow',
  sheep: 'baa',
  lion: 'roar',
  owl: 'hoot',
  horse: 'neigh',
  frog: 'ribbit',
  bee: 'buzz'
};

export const ANIMALS = Object.keys(ANIMAL_SOUNDS);
