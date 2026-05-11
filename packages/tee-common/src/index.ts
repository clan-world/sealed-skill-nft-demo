import fs from 'node:fs/promises';
import path from 'node:path';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { createMockAttestation } from '@sealed-skill/attestation';
import { fingerprintPublicKey, generateEd25519KeyPair, generateX25519KeyPair, signJson, type Ed25519KeyPairPem, type X25519KeyPairPem } from '@sealed-skill/crypto';
import { addMinutesIso, type SignedEnvelope, type TeeRecord, type TeeRole } from '@sealed-skill/protocol';

export interface TeeIdentity {
  role: TeeRole;
  serviceName: string;
  sign: Ed25519KeyPairPem;
  wrap: X25519KeyPairPem;
  measurement: string;
  attestation: unknown;
}

export async function loadOrCreateTeeIdentity(input: {
  role: TeeRole;
  serviceName: string;
  dataDir: string;
  version?: string;
}): Promise<TeeIdentity> {
  const dir = path.join(input.dataDir, 'tee-identities');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${input.role}.json`);
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as TeeIdentity;
    return parsed;
  } catch {
    const sign = generateEd25519KeyPair();
    const wrap = generateX25519KeyPair();
    const attestation = createMockAttestation({
      role: input.role,
      serviceName: input.serviceName,
      signPublicKeyPem: sign.publicKeyPem,
      wrapPublicKeyPem: wrap.publicKeyPem,
      version: input.version ?? '0.1.0'
    });
    const identity: TeeIdentity = {
      role: input.role,
      serviceName: input.serviceName,
      sign,
      wrap,
      measurement: attestation.measurement,
      attestation
    };
    await fs.writeFile(file, JSON.stringify(identity, null, 2));
    return identity;
  }
}

export function toTeeRecord(identity: TeeIdentity, serviceUrl: string): TeeRecord {
  return {
    role: identity.role,
    serviceUrl,
    signPublicKeyPem: identity.sign.publicKeyPem,
    wrapPublicKeyPem: identity.wrap.publicKeyPem,
    measurement: identity.measurement,
    attestationMode: 'mock',
    attestation: identity.attestation,
    expiresAt: addMinutesIso(24 * 60),
    revoked: false
  };
}

export function signByTee<T>(identity: TeeIdentity, payload: T): SignedEnvelope<T> {
  return signJson(identity.sign.privateKeyPem, payload, identity.sign.publicKeyPem);
}

export function publicKeyShort(pem: string): string {
  return fingerprintPublicKey(pem).slice(0, 10);
}

export async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(body);
}

export function createJsonServer(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>): http.Server {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 200, { ok: true });
      return;
    }
    try {
      await handler(req, res);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${url}: ${text}`);
  }
  return (await res.json()) as T;
}
