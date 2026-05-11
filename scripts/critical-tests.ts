import assert from 'node:assert/strict';
import { hashJson, canonicalJson } from '../packages/protocol/src/index.js';
import { createEmptyDemoState, getDemoPhase, mergeTee } from '../packages/demo-state/src/index.js';
import {
  decryptArtifactJson,
  encryptArtifactJson,
  generateEd25519KeyPair,
  generateSymmetricKey,
  generateX25519KeyPair,
  signJson,
  unwrapSecretWithPrivateKey,
  verifyJson,
  wrapSecretForPublicKey
} from '../packages/crypto/src/index.js';

assert.equal(canonicalJson({ z: 1, a: 2 }), canonicalJson({ a: 2, z: 1 }), 'canonical JSON should be stable');
assert.equal(hashJson({ z: 1, a: 2 }), hashJson({ a: 2, z: 1 }), 'hashJson should be stable');

const signer = generateEd25519KeyPair();
const signed = signJson(signer.privateKeyPem, { kind: 'creation', artifact: 'x' }, signer.publicKeyPem);
assert.equal(verifyJson(signed), true, 'signed transcript should verify');

const broker = generateX25519KeyPair();
const runtimeSession = generateX25519KeyPair();
const key = generateSymmetricKey();
const artifact = { animal: 'duck', secretTrait: 'moonlit' };
const artifactId = 'artifact_test';
const runtimePolicyHash = hashJson({ runtime: 'tee3', prompt: 'what sound does this animal make?' });
const encrypted = encryptArtifactJson(artifact, key, { artifactId, runtimePolicyHash, version: 1 });
const sealedForBroker = wrapSecretForPublicKey(key, broker.publicKeyPem, { artifactId, recipientRole: 'broker', runtimePolicyHash });
const brokerRecovered = unwrapSecretWithPrivateKey(sealedForBroker, broker.privateKeyPem, { artifactId, recipientRole: 'broker', runtimePolicyHash });
const sessionWrapped = wrapSecretForPublicKey(brokerRecovered, runtimeSession.publicKeyPem, { artifactId, ownerPublicKey: 'wallet_b', epoch: 2 });
const runtimeRecovered = unwrapSecretWithPrivateKey(sessionWrapped, runtimeSession.privateKeyPem, { artifactId, ownerPublicKey: 'wallet_b', epoch: 2 });
const clear = decryptArtifactJson<typeof artifact>(encrypted.ciphertext, encrypted.ref, runtimeRecovered, { artifactId, runtimePolicyHash, version: 1 });
assert.deepEqual(clear, artifact, 'runtime should recover the hidden artifact through broker session wrapping');

let state = createEmptyDemoState();
assert.equal(getDemoPhase(state), 'empty');
state = mergeTee(state, {
  role: 'broker', serviceUrl: 'x', signPublicKeyPem: 's', wrapPublicKeyPem: 'w', measurement: 'm', attestationMode: 'mock', attestation: {}, expiresAt: new Date().toISOString(), revoked: false
});
assert.equal(state.tees.broker?.role, 'broker');

console.log('Critical tests passed.');
