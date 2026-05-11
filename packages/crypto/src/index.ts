import {
  createCipheriv,
  createDecipheriv,
  createHash,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign as nodeSign,
  verify as nodeVerify,
  createPublicKey,
  createPrivateKey,
  type KeyObject
} from 'node:crypto';
import { canonicalJson, hashJson, type EncryptedBlobRef, type SignedEnvelope, type WrappedSecret } from '@sealed-skill/protocol';

export interface Ed25519KeyPairPem {
  publicKeyPem: string;
  privateKeyPem: string;
}

export interface X25519KeyPairPem {
  publicKeyPem: string;
  privateKeyPem: string;
}

export interface EncryptedArtifact {
  ref: EncryptedBlobRef;
  ciphertext: Buffer;
}

export function randomHex(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

export function sha256Buffer(data: Uint8Array | string): Buffer {
  return createHash('sha256').update(data).digest();
}

export function sha256Hex(data: Uint8Array | string): string {
  return sha256Buffer(data).toString('hex');
}

export function b64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

export function fromB64(data: string): Buffer {
  return Buffer.from(data, 'base64');
}

export function generateEd25519KeyPair(): Ed25519KeyPairPem {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  };
}

export function generateX25519KeyPair(): X25519KeyPairPem {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  };
}

export function fingerprintPublicKey(publicKeyPem: string): string {
  return sha256Hex(publicKeyPem).slice(0, 32);
}

export function signJson<T>(privateKeyPem: string, payload: T, signerPublicKeyPem: string): SignedEnvelope<T> {
  const message = Buffer.from(canonicalJson(payload));
  const signature = nodeSign(null, message, privateKeyPem);
  return {
    payload,
    signerPublicKeyPem,
    signatureB64: b64(signature),
    payloadHash: hashJson(payload)
  };
}

export function verifyJson<T>(envelope: SignedEnvelope<T>): boolean {
  const message = Buffer.from(canonicalJson(envelope.payload));
  const ok = nodeVerify(null, message, envelope.signerPublicKeyPem, fromB64(envelope.signatureB64));
  return ok && envelope.payloadHash === hashJson(envelope.payload);
}

function importPublic(pem: string): KeyObject {
  return createPublicKey(pem);
}

function importPrivate(pem: string): KeyObject {
  return createPrivateKey(pem);
}

function deriveWrapKey(shared: Buffer, salt: Buffer, aadHash: string): Buffer {
  const out = hkdfSync('sha256', shared, salt, Buffer.from(`sealed-skill/key-wrap/v1/${aadHash}`), 32);
  return Buffer.from(out);
}

export function wrapSecretForPublicKey(secret: Buffer, recipientPublicKeyPem: string, aad: unknown): WrappedSecret {
  const eph = generateX25519KeyPair();
  const shared = diffieHellman({ privateKey: importPrivate(eph.privateKeyPem), publicKey: importPublic(recipientPublicKeyPem) });
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const aadHash = hashJson(aad);
  const key = deriveWrapKey(shared, salt, aadHash);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aadHash));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: 'X25519-HKDF-SHA256-AES-256-GCM',
    recipientPublicKeyPem,
    ephemeralPublicKeyPem: eph.publicKeyPem,
    saltB64: b64(salt),
    ivB64: b64(iv),
    ciphertextB64: b64(ciphertext),
    tagB64: b64(tag),
    aadHash
  };
}

export function unwrapSecretWithPrivateKey(wrapped: WrappedSecret, recipientPrivateKeyPem: string, aad: unknown): Buffer {
  const aadHash = hashJson(aad);
  if (aadHash !== wrapped.aadHash) throw new Error('Wrapped secret AAD hash mismatch');
  const shared = diffieHellman({ privateKey: importPrivate(recipientPrivateKeyPem), publicKey: importPublic(wrapped.ephemeralPublicKeyPem) });
  const key = deriveWrapKey(shared, fromB64(wrapped.saltB64), wrapped.aadHash);
  const decipher = createDecipheriv('aes-256-gcm', key, fromB64(wrapped.ivB64));
  decipher.setAAD(Buffer.from(wrapped.aadHash));
  decipher.setAuthTag(fromB64(wrapped.tagB64));
  return Buffer.concat([decipher.update(fromB64(wrapped.ciphertextB64)), decipher.final()]);
}

export function generateSymmetricKey(): Buffer {
  return randomBytes(32);
}

export function encryptArtifactJson(value: unknown, key: Buffer, aad: unknown, uri = 'memory://artifact'): EncryptedArtifact {
  const plaintext = Buffer.from(canonicalJson(value));
  const iv = randomBytes(12);
  const aadHash = hashJson(aad);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aadHash));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext,
    ref: {
      uri,
      sha256: sha256Hex(ciphertext),
      bytes: ciphertext.byteLength,
      encryption: 'AES-256-GCM',
      ivB64: b64(iv),
      tagB64: b64(tag),
      aadHash
    }
  };
}

export function decryptArtifactJson<T>(ciphertext: Buffer, ref: EncryptedBlobRef, key: Buffer, aad: unknown): T {
  const aadHash = hashJson(aad);
  if (ref.aadHash !== aadHash) throw new Error('Encrypted artifact AAD hash mismatch');
  if (ref.sha256 !== sha256Hex(ciphertext)) throw new Error('Encrypted artifact hash mismatch');
  const decipher = createDecipheriv('aes-256-gcm', key, fromB64(ref.ivB64));
  decipher.setAAD(Buffer.from(aadHash));
  decipher.setAuthTag(fromB64(ref.tagB64));
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}
