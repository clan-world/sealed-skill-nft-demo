import { config as loadEnv } from 'dotenv';
loadEnv({ path: '../../.env' });
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashJson, addMinutesIso, isExpired, makeNonce, type AccessCapsule, type ArtifactRecord, type TransferTranscript } from '@sealed-skill/protocol';
import { randomHex, unwrapSecretWithPrivateKey, wrapSecretForPublicKey } from '@sealed-skill/crypto';
import { createJsonServer, loadOrCreateTeeIdentity, readJsonBody, sendJson, signByTee, toTeeRecord } from '@sealed-skill/tee-common';

const port = Number(process.env.TEE_BROKER_PORT ?? 4101);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dataDir = path.resolve(repoRoot, process.env.DEMO_DATA_DIR ?? 'data');
const serviceUrl = process.env.TEE_BROKER_PUBLIC_URL ?? `http://localhost:${port}`;
const identity = await loadOrCreateTeeIdentity({ role: 'broker', serviceName: 'tee-broker', dataDir });

function unwrapArtifactKey(artifact: ArtifactRecord): Buffer {
  return unwrapSecretWithPrivateKey(artifact.sealedKeyForBroker, identity.wrap.privateKeyPem, {
    artifactId: artifact.artifactId,
    recipientRole: 'broker',
    runtimePolicyHash: hashJson(artifact.runtimePolicy)
  });
}

const server = createJsonServer(async (req, res) => {
  const url = new URL(req.url ?? '/', serviceUrl);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, tee: toTeeRecord(identity, serviceUrl) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/prepare-transfer') {
    const body = await readJsonBody(req) as {
      artifact: ArtifactRecord;
      nftMint: string;
      fromOwner: string;
      toOwner: string;
    };
    if (!body.artifact?.artifactId) throw new Error('artifact required');
    if (!body.nftMint) throw new Error('nftMint required');
    if (!body.fromOwner || !body.toOwner) throw new Error('fromOwner and toOwner required');

    // Prove to ourselves that Broker TEE can still unwrap the artifact key.
    unwrapArtifactKey(body.artifact);

    const payload: TransferTranscript = {
      kind: 'transfer',
      artifactId: body.artifact.artifactId,
      nftMint: body.nftMint,
      fromOwner: body.fromOwner,
      toOwner: body.toOwner,
      epoch: body.artifact.epoch,
      nextEpoch: body.artifact.epoch + 1,
      runtimePolicyHash: hashJson(body.artifact.runtimePolicy),
      nonce: makeNonce('transfer'),
      expiresAt: addMinutesIso(10)
    };

    const capsule: AccessCapsule = {
      artifactId: body.artifact.artifactId,
      nftMint: body.nftMint,
      ownerPublicKey: body.toOwner,
      epoch: body.artifact.epoch + 1,
      runtimePolicyHash: hashJson(body.artifact.runtimePolicy),
      nonce: makeNonce('capsule'),
      expiresAt: addMinutesIso(10)
    };

    sendJson(res, 200, {
      transcript: signByTee(identity, payload),
      capsule: signByTee(identity, capsule)
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/release-session-key') {
    const body = await readJsonBody(req) as {
      artifact: ArtifactRecord;
      nftMint: string;
      ownerPublicKey: string;
      currentOwnerPublicKey: string;
      runtimeSessionPublicKeyPem: string;
      epoch: number;
      requestNonce: string;
    };
    if (!body.artifact) throw new Error('artifact required');
    if (body.ownerPublicKey !== body.currentOwnerPublicKey) throw new Error('caller is not current owner');
    if (body.epoch !== body.artifact.epoch) throw new Error('epoch mismatch');

    const key = unwrapArtifactKey(body.artifact);
    const aad = {
      artifactId: body.artifact.artifactId,
      nftMint: body.nftMint,
      ownerPublicKey: body.ownerPublicKey,
      epoch: body.epoch,
      runtimeMeasurement: body.artifact.runtimePolicy.runtimeMeasurement,
      requestNonce: body.requestNonce
    };
    const sessionWrappedKey = wrapSecretForPublicKey(key, body.runtimeSessionPublicKeyPem, aad);
    const capsule: AccessCapsule = {
      artifactId: body.artifact.artifactId,
      nftMint: body.nftMint,
      ownerPublicKey: body.ownerPublicKey,
      epoch: body.epoch,
      runtimePolicyHash: hashJson(body.artifact.runtimePolicy),
      nonce: `release_${randomHex(8)}`,
      expiresAt: addMinutesIso(2)
    };
    if (isExpired(capsule.expiresAt)) throw new Error('capsule expired unexpectedly');

    sendJson(res, 200, {
      sessionWrappedKey,
      releaseCapsule: signByTee(identity, capsule),
      aad
    });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(port, () => console.log(`TEE Broker listening on ${serviceUrl}`));
