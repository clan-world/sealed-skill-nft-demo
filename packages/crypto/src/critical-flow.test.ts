import { describe, expect, it } from 'vitest';
import { hashJson } from '@sealed-skill/protocol';
import {
  decryptArtifactJson,
  encryptArtifactJson,
  generateSymmetricKey,
  generateX25519KeyPair,
  unwrapSecretWithPrivateKey,
  wrapSecretForPublicKey
} from './index.js';

describe('sealed skill critical flow', () => {
  it('creator seals to broker, broker releases to runtime session, runtime decrypts artifact', () => {
    const broker = generateX25519KeyPair();
    const runtimeSession = generateX25519KeyPair();
    const artifact = { animal: 'duck', secretTrait: 'moonlit' };
    const runtimePolicy = { allowedPrompt: 'what sound does this animal make?', runtime: 'tee3' };
    const artifactId = 'artifact_test';
    const artifactKey = generateSymmetricKey();

    const encrypted = encryptArtifactJson(artifact, artifactKey, {
      artifactId,
      runtimePolicyHash: hashJson(runtimePolicy),
      version: 1
    });

    const sealedForBroker = wrapSecretForPublicKey(artifactKey, broker.publicKeyPem, {
      artifactId,
      recipientRole: 'broker',
      runtimePolicyHash: hashJson(runtimePolicy)
    });

    const brokerRecoveredKey = unwrapSecretWithPrivateKey(sealedForBroker, broker.privateKeyPem, {
      artifactId,
      recipientRole: 'broker',
      runtimePolicyHash: hashJson(runtimePolicy)
    });

    const sessionWrappedKey = wrapSecretForPublicKey(brokerRecoveredKey, runtimeSession.publicKeyPem, {
      artifactId,
      ownerPublicKey: 'wallet_b',
      epoch: 2,
      runtime: 'tee3'
    });

    const runtimeRecoveredKey = unwrapSecretWithPrivateKey(sessionWrappedKey, runtimeSession.privateKeyPem, {
      artifactId,
      ownerPublicKey: 'wallet_b',
      epoch: 2,
      runtime: 'tee3'
    });

    const clear = decryptArtifactJson<typeof artifact>(encrypted.ciphertext, encrypted.ref, runtimeRecoveredKey, {
      artifactId,
      runtimePolicyHash: hashJson(runtimePolicy),
      version: 1
    });

    expect(clear).toEqual(artifact);
  });
});
