import { config as loadEnv } from 'dotenv';
loadEnv({ path: '../../.env' });
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptArtifactJson, generateX25519KeyPair, unwrapSecretWithPrivateKey } from '@sealed-skill/crypto';
import { answerAnimalSound, isAllowedPrompt } from '@sealed-skill/policies';
import { hashJson, makeNonce, nowIso, type ArtifactRecord, type RuntimeTranscript } from '@sealed-skill/protocol';
import { FileBlobStore } from '@sealed-skill/storage';
import { createJsonServer, fetchJson, loadOrCreateTeeIdentity, readJsonBody, sendJson, signByTee, toTeeRecord } from '@sealed-skill/tee-common';

const port = Number(process.env.TEE_RUNTIME_PORT ?? 4103);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dataDir = path.resolve(repoRoot, process.env.DEMO_DATA_DIR ?? 'data');
const serviceUrl = process.env.TEE_RUNTIME_PUBLIC_URL ?? `http://localhost:${port}`;
const brokerUrl = process.env.TEE_BROKER_URL ?? 'http://localhost:4101';
const identity = await loadOrCreateTeeIdentity({ role: 'runtime', serviceName: 'tee-runtime', dataDir });
const store = new FileBlobStore(`${dataDir}/blobs`);

interface AnimalArtifact {
  animal: string;
  secretTrait: string;
  privateSeed: string;
  note: string;
}

const server = createJsonServer(async (req, res) => {
  const url = new URL(req.url ?? '/', serviceUrl);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, tee: toTeeRecord(identity, serviceUrl) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/run') {
    const body = await readJsonBody(req) as {
      artifact: ArtifactRecord;
      nftMint: string;
      callerPublicKey: string;
      currentOwnerPublicKey: string;
      prompt: string;
    };
    if (!body.artifact) throw new Error('artifact required');
    if (!isAllowedPrompt(body.prompt)) throw new Error('Prompt blocked by runtime policy');
    if (body.callerPublicKey !== body.currentOwnerPublicKey) throw new Error('caller is not current NFTee owner');
    if (body.artifact.runtimePolicy.runtimeMeasurement !== identity.measurement) throw new Error('runtime measurement is not approved for artifact');

    const session = generateX25519KeyPair();
    const requestNonce = makeNonce('runtime');
    const release = await fetchJson<{
      sessionWrappedKey: any;
      aad: unknown;
    }>(`${brokerUrl}/release-session-key`, {
      method: 'POST',
      body: JSON.stringify({
        artifact: body.artifact,
        nftMint: body.nftMint,
        ownerPublicKey: body.callerPublicKey,
        currentOwnerPublicKey: body.currentOwnerPublicKey,
        runtimeSessionPublicKeyPem: session.publicKeyPem,
        epoch: body.artifact.epoch,
        requestNonce
      })
    });

    const artifactKey = unwrapSecretWithPrivateKey(release.sessionWrappedKey, session.privateKeyPem, release.aad);
    const ciphertext = await store.get(body.artifact.encryptedBlob.uri);
    const artifactAad = {
      artifactId: body.artifact.artifactId,
      runtimePolicyHash: hashJson(body.artifact.runtimePolicy),
      version: 1
    };
    const artifact = decryptArtifactJson<AnimalArtifact>(ciphertext, body.artifact.encryptedBlob, artifactKey, artifactAad);
    const output = answerAnimalSound(artifact.animal).slice(0, body.artifact.runtimePolicy.maxOutputChars);

    const transcript: RuntimeTranscript = {
      kind: 'runtime-result',
      artifactId: body.artifact.artifactId,
      nftMint: body.nftMint,
      callerPublicKey: body.callerPublicKey,
      promptHash: hashJson({ prompt: body.prompt }),
      outputHash: hashJson({ output }),
      encryptedBlobHash: body.artifact.encryptedBlob.sha256,
      epoch: body.artifact.epoch,
      runtimeMeasurement: identity.measurement,
      nonce: requestNonce,
      createdAt: nowIso()
    };

    sendJson(res, 200, {
      output,
      plaintextArtifact: '[hidden inside Runtime TEE]',
      transcript: signByTee(identity, transcript)
    });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(port, () => console.log(`TEE Runtime listening on ${serviceUrl}`));
