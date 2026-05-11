import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256Hex } from '@sealed-skill/crypto';

export interface BlobStore {
  put(buffer: Buffer): Promise<{ uri: string; sha256: string; bytes: number }>;
  get(uri: string): Promise<Buffer>;
}

export class FileBlobStore implements BlobStore {
  constructor(private readonly rootDir: string) {}

  async put(buffer: Buffer): Promise<{ uri: string; sha256: string; bytes: number }> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const hash = sha256Hex(buffer);
    const file = path.join(this.rootDir, `${hash}.bin`);
    await fs.writeFile(file, buffer);
    return { uri: `file://${file}`, sha256: hash, bytes: buffer.byteLength };
  }

  async get(uri: string): Promise<Buffer> {
    if (!uri.startsWith('file://')) throw new Error(`Unsupported URI: ${uri}`);
    return fs.readFile(uri.slice('file://'.length));
  }
}
