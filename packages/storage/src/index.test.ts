import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalrusBlobStore } from './index.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('WalrusBlobStore', () => {
  it('records newly-created Walrus receipt metadata', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      newlyCreated: {
        blobObject: {
          id: '0xblob_object',
          blobId: 'blob_new',
          storage: { endEpoch: 42 }
        }
      }
    }), { status: 200 })) as typeof fetch;

    const store = new WalrusBlobStore({
      publisherUrl: 'https://publisher.example/',
      aggregatorUrl: 'https://aggregator.example/',
      epochs: 3
    });
    const result = await store.put(Buffer.from('sealed'));

    expect(result.uri).toBe('walrus://blob_new');
    expect(result.storage).toMatchObject({
      provider: 'walrus',
      status: 'Newly created',
      blobId: 'blob_new',
      endEpoch: 42,
      epochs: 3,
      readUrl: 'https://aggregator.example/v1/blobs/blob_new',
      suiUrl: 'https://suiscan.xyz/testnet/object/0xblob_object'
    });
  });

  it('URL-encodes blob IDs in Walrus receipt read URLs', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      newlyCreated: {
        blobObject: {
          id: '0xblob_object',
          blobId: 'blob/with reserved+chars',
          storage: { endEpoch: 42 }
        }
      }
    }), { status: 200 })) as typeof fetch;

    const store = new WalrusBlobStore({
      publisherUrl: 'https://publisher.example',
      aggregatorUrl: 'https://aggregator.example'
    });
    const result = await store.put(Buffer.from('sealed'));

    expect(result.storage?.readUrl).toBe('https://aggregator.example/v1/blobs/blob%2Fwith%20reserved%2Bchars');
  });

  it('records already-certified Walrus event metadata', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      alreadyCertified: {
        blobId: 'blob_existing',
        endEpoch: 77,
        event: { txDigest: 'tx_digest' }
      }
    }), { status: 200 })) as typeof fetch;

    const store = new WalrusBlobStore({
      publisherUrl: 'https://publisher.example',
      aggregatorUrl: 'https://aggregator.example'
    });
    const result = await store.put(Buffer.from('sealed'));

    expect(result.storage).toMatchObject({
      status: 'Already certified',
      blobId: 'blob_existing',
      suiUrl: 'https://suiscan.xyz/testnet/tx/tx_digest'
    });
  });

  it('reads blobs from the configured aggregator', async () => {
    globalThis.fetch = vi.fn(async () => new Response('ciphertext', { status: 200 })) as typeof fetch;
    const store = new WalrusBlobStore({
      publisherUrl: 'https://publisher.example',
      aggregatorUrl: 'https://aggregator.example'
    });

    const buffer = await store.get('walrus://blob_read');

    expect(buffer.toString('utf8')).toBe('ciphertext');
    expect(globalThis.fetch).toHaveBeenCalledWith('https://aggregator.example/v1/blobs/blob_read');
  });

  it('rejects Walrus reads with an empty blob ID', async () => {
    globalThis.fetch = vi.fn() as typeof fetch;
    const store = new WalrusBlobStore({
      publisherUrl: 'https://publisher.example',
      aggregatorUrl: 'https://aggregator.example'
    });

    await expect(store.get('walrus://')).rejects.toThrow('does not include a blob ID');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid Walrus epoch counts', () => {
    expect(() => new WalrusBlobStore({
      publisherUrl: 'https://publisher.example',
      aggregatorUrl: 'https://aggregator.example',
      epochs: Number.NaN
    })).toThrow('WALRUS_EPOCHS must be a positive integer');
  });
});
