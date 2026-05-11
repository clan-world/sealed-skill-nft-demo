import { describe, expect, it } from 'vitest';
import { decryptArtifactJson, encryptArtifactJson, generateEd25519KeyPair, generateSymmetricKey, generateX25519KeyPair, signJson, unwrapSecretWithPrivateKey, verifyJson, wrapSecretForPublicKey } from './index.js';

describe('crypto critical path', () => {
  it('encrypts and decrypts an artifact with authenticated metadata', () => {
    const key = generateSymmetricKey();
    const aad = { artifactId: 'artifact_1', epoch: 1 };
    const encrypted = encryptArtifactJson({ animal: 'duck' }, key, aad);
    const clear = decryptArtifactJson<{ animal: string }>(encrypted.ciphertext, encrypted.ref, key, aad);
    expect(clear.animal).toEqual('duck');
  });

  it('wraps and unwraps the symmetric key for a TEE public key', () => {
    const tee = generateX25519KeyPair();
    const key = generateSymmetricKey();
    const aad = { artifactId: 'artifact_1', recipient: 'broker' };
    const wrapped = wrapSecretForPublicKey(key, tee.publicKeyPem, aad);
    const unwrapped = unwrapSecretWithPrivateKey(wrapped, tee.privateKeyPem, aad);
    expect(unwrapped.equals(key)).toBe(true);
  });

  it('signs and verifies canonical transcripts', () => {
    const signer = generateEd25519KeyPair();
    const envelope = signJson(signer.privateKeyPem, { b: 2, a: 1 }, signer.publicKeyPem);
    expect(verifyJson(envelope)).toBe(true);
  });
});
