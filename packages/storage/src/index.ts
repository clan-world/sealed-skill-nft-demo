import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256Hex } from '@sealed-skill/crypto';

export interface BlobStorageReceipt {
  provider: 'file' | 'walrus';
  status?: string;
  blobId?: string;
  readUrl?: string;
  suiRefType?: 'Associated Sui Object' | 'Previous Sui Certified Event';
  suiRef?: string;
  suiUrl?: string;
  endEpoch?: number;
  epochs?: number;
  publisherUrl?: string;
  aggregatorUrl?: string;
}

export interface BlobPutResult {
  uri: string;
  sha256: string;
  bytes: number;
  storage?: BlobStorageReceipt;
}

export interface BlobStore {
  put(buffer: Buffer): Promise<BlobPutResult>;
  get(uri: string): Promise<Buffer>;
}

export class FileBlobStore implements BlobStore {
  constructor(private readonly rootDir: string) {}

  async put(buffer: Buffer): Promise<BlobPutResult> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const hash = sha256Hex(buffer);
    const file = path.resolve(this.rootDir, `${hash}.bin`);
    await fs.writeFile(file, buffer);
    return { uri: `file://${file}`, sha256: hash, bytes: buffer.byteLength, storage: { provider: 'file' } };
  }

  async get(uri: string): Promise<Buffer> {
    if (!uri.startsWith('file://')) throw new Error(`Unsupported URI: ${uri}`);
    const file = uri.slice('file://'.length);
    try {
      return await fs.readFile(file);
    } catch (error) {
      if (path.isAbsolute(file)) throw error;
      return fs.readFile(path.join(this.rootDir, path.basename(file)));
    }
  }
}

export interface WalrusBlobStoreOptions {
  publisherUrl: string;
  aggregatorUrl: string;
  epochs?: number;
  suiNetwork?: 'testnet' | 'mainnet';
}

export class WalrusBlobStore implements BlobStore {
  private readonly publisherUrl: string;
  private readonly aggregatorUrl: string;
  private readonly epochs: number;
  private readonly suiNetwork: 'testnet' | 'mainnet';

  constructor(options: WalrusBlobStoreOptions) {
    this.publisherUrl = stripSlash(options.publisherUrl);
    this.aggregatorUrl = stripSlash(options.aggregatorUrl);
    this.epochs = normalizeWalrusEpochs(options.epochs);
    this.suiNetwork = options.suiNetwork ?? 'testnet';
  }

  async put(buffer: Buffer): Promise<BlobPutResult> {
    const hash = sha256Hex(buffer);
    const response = await fetch(`${this.publisherUrl}/v1/blobs?epochs=${this.epochs}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array(buffer)
    });
    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Walrus upload failed: HTTP ${response.status}${details ? ` ${details}` : ''}`);
    }
    const receipt = parseWalrusReceipt(await response.json(), {
      aggregatorUrl: this.aggregatorUrl,
      publisherUrl: this.publisherUrl,
      epochs: this.epochs,
      suiNetwork: this.suiNetwork
    });
    if (!receipt.blobId) throw new Error('Walrus upload response did not include a blob ID');
    return {
      uri: `walrus://${receipt.blobId}`,
      sha256: hash,
      bytes: buffer.byteLength,
      storage: receipt
    };
  }

  async get(uri: string): Promise<Buffer> {
    const blobId = blobIdFromUri(uri);
    const url = `${this.aggregatorUrl}/v1/blobs/${encodeURIComponent(blobId)}`;
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await fetch(url);
        if (response.ok) return Buffer.from(await response.arrayBuffer());
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await sleep(250 * (attempt + 1));
    }
    throw new Error(`Walrus read failed for ${blobId}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }
}

export function createBlobStoreFromEnv(rootDir: string, env: NodeJS.ProcessEnv = process.env): BlobStore {
  if ((env.STORAGE_BACKEND ?? 'file').toLowerCase() === 'walrus') {
    const epochs = parseWalrusEpochs(env.WALRUS_EPOCHS);
    return new WalrusBlobStore({
      publisherUrl: env.WALRUS_PUBLISHER_URL ?? 'https://publisher.walrus-testnet.walrus.space',
      aggregatorUrl: env.WALRUS_AGGREGATOR_URL ?? 'https://aggregator.walrus-testnet.walrus.space',
      ...(epochs === undefined ? {} : { epochs }),
      suiNetwork: env.WALRUS_SUI_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
    });
  }
  return new FileBlobStore(rootDir);
}

function parseWalrusReceipt(value: unknown, context: {
  aggregatorUrl: string;
  publisherUrl: string;
  epochs: number;
  suiNetwork: 'testnet' | 'mainnet';
}): BlobStorageReceipt {
  const record = value as {
    alreadyCertified?: {
      blobId?: string;
      endEpoch?: number;
      event?: { txDigest?: string };
    };
    newlyCreated?: {
      blobObject?: {
        id?: string;
        blobId?: string;
        storage?: { endEpoch?: number };
      };
    };
  };
  if (record.alreadyCertified) {
    const blobId = record.alreadyCertified.blobId;
    const suiRef = record.alreadyCertified.event?.txDigest;
    return makeWalrusReceipt({
      status: 'Already certified',
      blobId,
      endEpoch: record.alreadyCertified.endEpoch,
      suiRefType: 'Previous Sui Certified Event',
      suiRef,
      ...context
    });
  }
  if (record.newlyCreated) {
    const blobId = record.newlyCreated.blobObject?.blobId;
    const suiRef = record.newlyCreated.blobObject?.id;
    return makeWalrusReceipt({
      status: 'Newly created',
      blobId,
      endEpoch: record.newlyCreated.blobObject?.storage?.endEpoch,
      suiRefType: 'Associated Sui Object',
      suiRef,
      ...context
    });
  }
  throw new Error('Unhandled Walrus upload response');
}

function makeWalrusReceipt(input: {
  status: string;
  blobId?: string | undefined;
  endEpoch?: number | undefined;
  suiRefType: 'Associated Sui Object' | 'Previous Sui Certified Event';
  suiRef?: string | undefined;
  aggregatorUrl: string;
  publisherUrl: string;
  epochs: number;
  suiNetwork: 'testnet' | 'mainnet';
}): BlobStorageReceipt {
  const suiPath = input.suiRefType === 'Associated Sui Object' ? 'object' : 'tx';
  const receipt: BlobStorageReceipt = {
    provider: 'walrus',
    status: input.status,
    suiRefType: input.suiRefType,
    epochs: input.epochs,
    publisherUrl: input.publisherUrl,
    aggregatorUrl: input.aggregatorUrl
  };
  if (input.blobId) {
    receipt.blobId = input.blobId;
    receipt.readUrl = `${input.aggregatorUrl}/v1/blobs/${encodeURIComponent(input.blobId)}`;
  }
  if (input.suiRef) {
    receipt.suiRef = input.suiRef;
    receipt.suiUrl = `https://suiscan.xyz/${input.suiNetwork}/${suiPath}/${input.suiRef}`;
  }
  if (typeof input.endEpoch === 'number') receipt.endEpoch = input.endEpoch;
  return receipt;
}

function blobIdFromUri(uri: string): string {
  const blobId = uri.startsWith('walrus://')
    ? uri.slice('walrus://'.length)
    : /^https?:\/\//.test(uri)
      ? uri.split('/').filter(Boolean).at(-1) ?? ''
      : undefined;
  if (blobId === undefined) throw new Error(`Unsupported URI: ${uri}`);
  if (!blobId) throw new Error(`Walrus URI does not include a blob ID: ${uri}`);
  return decodeURIComponent(blobId);
}

function parseWalrusEpochs(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  return normalizeWalrusEpochs(Number(value));
}

function normalizeWalrusEpochs(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1) throw new Error(`WALRUS_EPOCHS must be a positive integer, got ${value}`);
  return value;
}

function stripSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
