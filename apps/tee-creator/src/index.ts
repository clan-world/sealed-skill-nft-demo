import { config as loadEnv } from 'dotenv';
loadEnv({ path: '../../.env' });
import { randomInt } from 'node:crypto';
import { encryptArtifactJson, generateSymmetricKey, randomHex, wrapSecretForPublicKey } from '@sealed-skill/crypto';
import { hashJson, ANIMALS, nowIso, makeNonce, type ArtifactRecord, type CreationTranscript, type RuntimePolicy } from '@sealed-skill/protocol';
import { FileBlobStore } from '@sealed-skill/storage';
import { createJsonServer, loadOrCreateTeeIdentity, readJsonBody, sendJson, signByTee, toTeeRecord } from '@sealed-skill/tee-common';

const port = Number(process.env.TEE_CREATOR_PORT ?? 4102);
const dataDir = process.env.DEMO_DATA_DIR ?? '../../data';
const serviceUrl = process.env.TEE_CREATOR_PUBLIC_URL ?? `http://localhost:${port}`;
const identity = await loadOrCreateTeeIdentity({ role: 'creator', serviceName: 'tee-creator', dataDir });
const store = new FileBlobStore(`${dataDir}/blobs`);

const server = createJsonServer(async (req, res) => {
  const url = new URL(req.url ?? '/', serviceUrl);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, tee: toTeeRecord(identity, serviceUrl) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/create-artifact') {
    const body = await readJsonBody(req) as {
      ownerPublicKey: string;
      brokerWrapPublicKeyPem: string;
      runtimeMeasurement: string;
      runtimeSignPublicKeyPem: string;
      prompt?: string;
    };
    if (!body.ownerPublicKey) throw new Error('ownerPublicKey required');
    if (!body.brokerWrapPublicKeyPem) throw new Error('brokerWrapPublicKeyPem required');

    const animal = ANIMALS[randomInt(0, ANIMALS.length)]!;
    const artifactId = `artifact_${randomHex(8)}`;
    const secretTrait = `trait_${randomHex(4)}`;
    const artifact = {
      animal,
      secretTrait,
      privateSeed: randomHex(16),
      note: 'This plaintext should never leave trusted execution in a real deployment.'
    };

    const runtimePolicy: RuntimePolicy = {
      policyId: `policy_${randomHex(6)}`,
      allowedPrompt: 'what sound does this animal make?',
      allowedOutput: 'animal-sound',
      runtimeMeasurement: body.runtimeMeasurement,
      runtimeSignPublicKeyPem: body.runtimeSignPublicKeyPem,
      maxOutputChars: 40
    };

    const key = generateSymmetricKey();
    const aad = { artifactId, runtimePolicyHash: hashJson(runtimePolicy), version: 1 };
    const encrypted = encryptArtifactJson(artifact, key, aad);
    const stored = await store.put(encrypted.ciphertext);
    encrypted.ref.uri = stored.uri;
    encrypted.ref.sha256 = stored.sha256;
    encrypted.ref.bytes = stored.bytes;

    const sealedKeyForBroker = wrapSecretForPublicKey(key, body.brokerWrapPublicKeyPem, {
      artifactId,
      recipientRole: 'broker',
      runtimePolicyHash: hashJson(runtimePolicy)
    });

    const record: ArtifactRecord = {
      artifactId,
      createdAt: nowIso(),
      creatorMeasurement: identity.measurement,
      ownerPublicKey: body.ownerPublicKey,
      encryptedBlob: encrypted.ref,
      sealedKeyForBroker,
      runtimePolicy,
      epoch: 1,
      status: 'created'
    };

    const transcript: CreationTranscript = {
      kind: 'creation',
      artifactId,
      prompt: body.prompt ?? 'choose the name of a random animal',
      ownerPublicKey: body.ownerPublicKey,
      encryptedBlobHash: record.encryptedBlob.sha256,
      sealedKeyHash: hashJson(sealedKeyForBroker),
      runtimePolicyHash: hashJson(runtimePolicy),
      creatorMeasurement: identity.measurement,
      nonce: makeNonce('create'),
      createdAt: nowIso()
    };

    sendJson(res, 200, {
      artifact: record,
      transcript: signByTee(identity, transcript),
      hiddenPlaintextPreview: '[hidden inside Creator TEE]'
    });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(port, () => console.log(`TEE Creator listening on ${serviceUrl}`));
