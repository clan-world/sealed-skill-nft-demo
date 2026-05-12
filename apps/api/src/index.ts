import { config as loadEnv } from 'dotenv';
loadEnv({ path: '../../.env' });
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import nacl from 'tweetnacl';
import { PublicKey, Transaction } from '@solana/web3.js';
import { canonicalJson, hashJson, type ArtifactRecord, type SignedEnvelope, type TeeRecord } from '@sealed-skill/protocol';
import { fetchJson } from '@sealed-skill/tee-common';
import { mergeTee } from '@sealed-skill/demo-state';
import { buildDemoNftTransferTx, getCurrentDemoNftOwner, getSealedSkillProgramId, loadOrCreateKeypair, makeConnection, mintOneSupplyDemoNft, recordBrokerTransferApproval, syncRegisteredArtifactOwner } from '@sealed-skill/solana';
import { StateStore } from './state.js';

const port = Number(process.env.API_PORT ?? 8787);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dataDir = path.resolve(repoRoot, process.env.DEMO_DATA_DIR ?? 'data');
const solanaEnabled = (process.env.SOLANA_ENABLED ?? 'false') === 'true';
const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const backendKeypairPath = process.env.BACKEND_KEYPAIR_PATH ?? `${dataDir}/solana/backend-keypair.json`;
const collectionStatePath = process.env.COLLECTION_STATE_PATH ?? `${dataDir}/solana/token-2022-collection.json`;
const publicBaseUrl = (process.env.PUBLIC_BASE_URL ?? process.env.VITE_PUBLIC_BASE_URL ?? 'https://nft.clan-world.com').replace(/\/+$/, '');
const sealedSkillProgramId = getSealedSkillProgramId(process.env.SEALED_SKILL_PROGRAM_ID);
const vellumEmblemPath = path.resolve(process.cwd(), '../../Vellum_Emblem.png');
const teeBrokerUrl = process.env.TEE_BROKER_URL ?? 'http://localhost:4101';
const teeCreatorUrl = process.env.TEE_CREATOR_URL ?? 'http://localhost:4102';
const teeRuntimeUrl = process.env.TEE_RUNTIME_URL ?? 'http://localhost:4103';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
const store = new StateStore(`${dataDir}/demo-state.json`);
const connection = makeConnection(rpcUrl);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function teeHealth(url: string): Promise<TeeRecord> {
  const result = await fetchJson<{ tee: TeeRecord }>(`${url}/health`);
  return result.tee;
}

function requireArtifact(state: Awaited<ReturnType<StateStore['read']>>): ArtifactRecord {
  if (!state.artifact) throw new Error('No artifact yet. Generate one first.');
  return state.artifact;
}

async function resolveCurrentOwner(artifact: ArtifactRecord, stateOwner?: string): Promise<string | undefined> {
  if (solanaEnabled && artifact.nftMint) {
    const owner = await getCurrentDemoNftOwner(connection, new PublicKey(artifact.nftMint));
    return owner?.toBase58();
  }
  return stateOwner ?? artifact.ownerPublicKey;
}

async function waitForCurrentOwner(artifact: ArtifactRecord, expectedOwner: string, stateOwner?: string): Promise<string | undefined> {
  let currentOwner: string | undefined;
  for (let i = 0; i < 8; i += 1) {
    currentOwner = await resolveCurrentOwner(artifact, stateOwner);
    if (currentOwner === expectedOwner) return currentOwner;
    await sleep(750);
  }
  return currentOwner;
}

function verifyRuntimeRequestSignature(input: {
  callerPublicKey: string;
  signatureB64: string;
  message: unknown;
}): boolean {
  try {
    const pub = new PublicKey(input.callerPublicKey);
    const messageBytes = Buffer.from(canonicalJson(input.message));
    return nacl.sign.detached.verify(messageBytes, Buffer.from(input.signatureB64, 'base64'), pub.toBytes());
  } catch {
    return false;
  }
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, solanaEnabled, rpcUrl, tokenProgram: 'Token-2022', sealedSkillProgramId: sealedSkillProgramId.toBase58(), teeBrokerUrl, teeCreatorUrl, teeRuntimeUrl });
});

app.get('/api/demo-state', async (_req, res) => {
  res.json(await store.read());
});

app.get('/api/nft/collection-metadata', (_req, res) => {
  res.json({
    name: 'Vellum Sealed Skill Collection',
    symbol: 'SSKILL',
    description: 'Demo collection for TEE-gated sealed skill NFTees on Solana devnet.',
    image: `${publicBaseUrl}/api/nft/vellum-emblem.png`
  });
});

app.get('/api/nft/collection-image.svg', (_req, res) => {
  res.redirect(302, '/api/nft/vellum-emblem.png');
});

app.get('/api/nft/vellum-emblem.png', (_req, res) => {
  res.type('png').sendFile(vellumEmblemPath);
});

app.get('/api/nft/metadata/:mint', async (req, res, next) => {
  try {
    const state = await store.read();
    const artifact = state.artifact;
    const mint = req.params.mint;
    if (!artifact?.nftMint || artifact.nftMint !== mint) {
      res.status(404).json({ error: 'metadata not found for mint' });
      return;
    }
    res.json({
      name: 'Vellum Sealed Skill NFTee',
      symbol: 'NFTee',
      description: 'A Token-2022 collectible NFTee that gates a sealed TEE artifact. The animal stays hidden; approved runtime calls can use it.',
      image: `${publicBaseUrl}/api/nft/image/${mint}.png`,
      external_url: publicBaseUrl,
      attributes: [
        { trait_type: 'Artifact status', value: artifact.status },
        { trait_type: 'Epoch', value: String(artifact.epoch) },
        { trait_type: 'Transfer gate', value: 'TEE1 broker hook' },
        { trait_type: 'Encrypted artifact hash', value: artifact.encryptedBlob.sha256 }
      ],
      properties: {
        category: 'image',
        tokenStandard: 'Token-2022',
        hookProgramId: artifact.hookProgramId,
        collectionMint: artifact.collectionMint
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/nft/image/:mint.svg', async (req, res, next) => {
  res.redirect(302, `/api/nft/image/${req.params.mint}.png`);
});

app.get('/api/nft/image/:mint.png', async (req, res, next) => {
  try {
    const state = await store.read();
    if (state.artifact?.nftMint !== req.params.mint) {
      res.status(404).send('not found');
      return;
    }
    res.type('png').sendFile(vellumEmblemPath);
  } catch (error) {
    next(error);
  }
});

app.post('/api/demo/reset', async (_req, res) => {
  const empty = { tees: {}, log: [] };
  await store.write(empty);
  res.json(empty);
});

app.post('/api/tees/register', async (_req, res) => {
  const [broker, creator, runtime] = await Promise.all([
    teeHealth(teeBrokerUrl),
    teeHealth(teeCreatorUrl),
    teeHealth(teeRuntimeUrl)
  ]);
  const next = await store.update((state) => mergeTee(mergeTee(mergeTee(state, broker), creator), runtime));
  res.json(next);
});

app.post('/api/artifacts/generate', async (req, res, next) => {
  try {
    const ownerPublicKey = String(req.body.ownerPublicKey ?? '');
    if (!ownerPublicKey) throw new Error('ownerPublicKey required');

    const state = await store.read();
    const broker = state.tees.broker ?? await teeHealth(teeBrokerUrl);
    const runtime = state.tees.runtime ?? await teeHealth(teeRuntimeUrl);
    const creator = state.tees.creator ?? await teeHealth(teeCreatorUrl);

    const created = await fetchJson<{
      artifact: ArtifactRecord;
      transcript: SignedEnvelope<any>;
    }>(`${teeCreatorUrl}/create-artifact`, {
      method: 'POST',
      body: JSON.stringify({
        ownerPublicKey,
        brokerWrapPublicKeyPem: broker.wrapPublicKeyPem,
        runtimeMeasurement: runtime.measurement,
        runtimeSignPublicKeyPem: runtime.signPublicKeyPem,
        prompt: 'choose the name of a random animal'
      })
    });

    const artifact: ArtifactRecord = { ...created.artifact, status: 'created' };
    const next = await store.update((s) => {
      const nextState = {
        ...s,
        tees: { ...s.tees, broker, creator, runtime },
        artifact,
        creationTranscript: created.transcript,
        currentOwner: ownerPublicKey,
        log: [`${new Date().toISOString()} Sealed artifact generated and ready to mint`, ...s.log]
      };
      delete nextState.transferTranscript;
      delete nextState.lastRuntimeResult;
      delete nextState.pendingTransferTo;
      return nextState;
    });

    res.json({ state: next });
  } catch (error) {
    next(error);
  }
});

app.post('/api/artifacts/mint', async (_req, res, next) => {
  try {
    const state = await store.read();
    const artifact = requireArtifact(state);
    if (artifact.nftMint) {
      res.json({ state, nftMint: artifact.nftMint });
      return;
    }

    let mintSignature: string | undefined;
    let nftMint: string;
    if (solanaEnabled) {
      const payer = await loadOrCreateKeypair(backendKeypairPath);
      const minted = await mintOneSupplyDemoNft({
        connection,
        payer,
        owner: new PublicKey(artifact.ownerPublicKey),
        collectionStatePath,
        metadataBaseUrl: publicBaseUrl,
        hookProgramId: sealedSkillProgramId,
        artifactId: artifact.artifactId,
        encryptedBlobHash: artifact.encryptedBlob.sha256,
        runtimePolicyHash: hashJson(artifact.runtimePolicy)
      });
      nftMint = minted.mint.toBase58();
      mintSignature = minted.signature;
      artifact.collectionMint = minted.collectionMint.toBase58();
      artifact.tokenProgram = minted.tokenProgram.toBase58();
      artifact.metadataUri = minted.metadataUri;
      artifact.hookProgramId = minted.hookProgramId.toBase58();
      artifact.artifactPda = minted.artifactPda.toBase58();
      artifact.approvalPda = minted.approvalPda.toBase58();
    } else {
      nftMint = `mock_mint_${artifact.artifactId}`;
      artifact.tokenProgram = 'mock-token-2022';
      artifact.metadataUri = `${publicBaseUrl}/api/nft/metadata/${nftMint}`;
      artifact.hookProgramId = sealedSkillProgramId.toBase58();
    }

    const mintedArtifact: ArtifactRecord = { ...artifact, nftMint, status: 'minted' };
    const nextState = await store.update((s) => ({
      ...s,
      artifact: mintedArtifact,
      currentOwner: artifact.ownerPublicKey,
      log: [`${new Date().toISOString()} NFTee minted to ${artifact.ownerPublicKey}: ${nftMint}`, ...s.log]
    }));

    res.json({ state: nextState, nftMint, mintSignature });
  } catch (error) {
    next(error);
  }
});

app.post('/api/access/run', async (req, res, next) => {
  try {
    const callerPublicKey = String(req.body.callerPublicKey ?? '');
    const prompt = String(req.body.prompt ?? 'what sound does this animal make?');
    const signatureB64 = String(req.body.signatureB64 ?? '');
    const requestMessage = req.body.message;
    if (!callerPublicKey) throw new Error('callerPublicKey required');
    if (!signatureB64 || !requestMessage) throw new Error('signed request required');
    if (!verifyRuntimeRequestSignature({ callerPublicKey, signatureB64, message: requestMessage })) {
      throw new Error('runtime request signature invalid');
    }

    const state = await store.read();
    const artifact = requireArtifact(state);
    const currentOwner = await resolveCurrentOwner(artifact, state.currentOwner);
    if (!currentOwner) throw new Error('Cannot resolve current NFTee owner');
    if (currentOwner !== callerPublicKey) {
      res.status(403).json({
        ok: false,
        reason: 'caller is not current NFTee owner',
        callerPublicKey,
        currentOwner
      });
      return;
    }

    const result = await fetchJson<{
      output: string;
      transcript: SignedEnvelope<any>;
    }>(`${teeRuntimeUrl}/run`, {
      method: 'POST',
      body: JSON.stringify({
        artifact,
        nftMint: artifact.nftMint,
        callerPublicKey,
        currentOwnerPublicKey: currentOwner,
        prompt
      })
    });

    const next = await store.update((s) => ({
      ...s,
      lastRuntimeResult: result,
      log: [`${new Date().toISOString()} Runtime succeeded for ${callerPublicKey}`, ...s.log]
    }));
    res.json({ ok: true, result, state: next });
  } catch (error) {
    next(error);
  }
});

app.post('/api/transfer/prepare', async (req, res, next) => {
  try {
    const fromPublicKey = String(req.body.fromPublicKey ?? '');
    const toPublicKey = String(req.body.toPublicKey ?? '');
    const state = await store.read();
    const artifact = requireArtifact(state);
    if (!artifact.nftMint) throw new Error('artifact has no NFTee mint');
    const currentOwner = await resolveCurrentOwner(artifact, state.currentOwner);
    if (currentOwner !== fromPublicKey) throw new Error(`fromPublicKey is not current owner. current=${currentOwner}`);

    const brokered = await fetchJson<{
      transcript: SignedEnvelope<any>;
      capsule: SignedEnvelope<any>;
    }>(`${teeBrokerUrl}/prepare-transfer`, {
      method: 'POST',
      body: JSON.stringify({ artifact, nftMint: artifact.nftMint, fromOwner: fromPublicKey, toOwner: toPublicKey })
    });
    let approvalSignature: string | undefined;
    let approvalPda = artifact.approvalPda;
    if (solanaEnabled) {
      const payer = await loadOrCreateKeypair(backendKeypairPath);
      await syncRegisteredArtifactOwner({
        connection,
        payer,
        mint: new PublicKey(artifact.nftMint),
        owner: new PublicKey(currentOwner),
        artifactId: artifact.artifactId,
        encryptedBlobHash: artifact.encryptedBlob.sha256,
        runtimePolicyHash: hashJson(artifact.runtimePolicy),
        programId: sealedSkillProgramId
      });
      const recorded = await recordBrokerTransferApproval({
        connection,
        payer,
        mint: new PublicKey(artifact.nftMint),
        toOwner: new PublicKey(toPublicKey),
        capsuleHash: brokered.capsule.payloadHash,
        expiresAt: brokered.transcript.payload.expiresAt,
        programId: sealedSkillProgramId
      });
      approvalSignature = recorded.signature;
      approvalPda = recorded.approvalPda.toBase58();
    }

    const next = await store.update((s) => ({
      ...s,
      transferTranscript: brokered.transcript,
      pendingTransferTo: toPublicKey,
      artifact: approvalPda ? { ...artifact, approvalPda } : artifact,
      log: [`${new Date().toISOString()} Transfer prepared from ${fromPublicKey} to ${toPublicKey}${approvalSignature ? ` approvalTx=${approvalSignature}` : ''}`, ...s.log]
    }));
    res.json({ ok: true, ...brokered, approvalSignature, state: next });
  } catch (error) {
    next(error);
  }
});

app.post('/api/transfer/build', async (req, res, next) => {
  try {
    const fromPublicKey = new PublicKey(String(req.body.fromPublicKey ?? ''));
    const toPublicKey = new PublicKey(String(req.body.toPublicKey ?? ''));
    const state = await store.read();
    const artifact = requireArtifact(state);
    if (!artifact.nftMint) throw new Error('artifact has no NFTee mint');
    if (state.pendingTransferTo !== toPublicKey.toBase58()) throw new Error('No prepared transfer for this recipient');
    if (state.transferTranscript?.payload.expiresAt && Date.now() >= Date.parse(state.transferTranscript.payload.expiresAt)) {
      throw new Error('TEE1 transfer capsule expired. Run Prepare broker transfer again.');
    }
    if (!solanaEnabled) {
      res.json({ mock: true, message: 'SOLANA_ENABLED=false; call /api/transfer/complete directly.' });
      return;
    }
    const tx = await buildDemoNftTransferTx({ connection, mint: new PublicKey(artifact.nftMint), fromOwner: fromPublicKey, toOwner: toPublicKey, hookProgramId: sealedSkillProgramId });
    res.json({ txBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64') });
  } catch (error) {
    next(error);
  }
});

app.post('/api/transfer/complete', async (req, res, next) => {
  try {
    const toPublicKey = String(req.body.toPublicKey ?? '');
    const signature = req.body.signature ? String(req.body.signature) : undefined;
    const state = await store.read();
    const artifact = requireArtifact(state);
    if (!artifact.nftMint) throw new Error('artifact has no NFTee mint');
    if (state.pendingTransferTo !== toPublicKey) throw new Error('No prepared transfer for this recipient');
    if (state.transferTranscript?.payload.expiresAt && Date.now() >= Date.parse(state.transferTranscript.payload.expiresAt)) {
      throw new Error('TEE1 transfer capsule expired. Run Prepare broker transfer again.');
    }

    if (solanaEnabled) {
      const currentOwner = signature
        ? await waitForCurrentOwner(artifact, toPublicKey, state.currentOwner)
        : await resolveCurrentOwner(artifact, state.currentOwner);
      if (currentOwner !== toPublicKey) throw new Error(`Solana owner is ${currentOwner}; expected ${toPublicKey}`);
    }

    const nextArtifact: ArtifactRecord = {
      ...artifact,
      ownerPublicKey: toPublicKey,
      epoch: artifact.epoch + 1,
      status: 'transferred'
    };
    const nextState = await store.update((s) => {
      const nextState = {
        ...s,
        artifact: nextArtifact,
        currentOwner: toPublicKey,
        log: [`${new Date().toISOString()} Transfer completed to ${toPublicKey}${signature ? ` tx=${signature}` : ''}`, ...s.log]
      };
      delete nextState.pendingTransferTo;
      delete nextState.lastRuntimeResult;
      return nextState;
    });
    res.json({ ok: true, state: nextState });
  } catch (error) {
    next(error);
  }
});

app.post('/api/ownership/check', async (req, res, next) => {
  try {
    const expectedOwner = String(req.body.expectedOwner ?? '');
    const state = await store.read();
    const artifact = requireArtifact(state);
    if (!artifact.nftMint) throw new Error('artifact has no NFTee mint');
    const currentOwner = await resolveCurrentOwner(artifact, state.currentOwner);
    const expectedOwnerOwnsNft = Boolean(expectedOwner && currentOwner === expectedOwner);

    let nextState = state;
    if (expectedOwnerOwnsNft && state.pendingTransferTo === expectedOwner && artifact.status !== 'transferred') {
      const nextArtifact: ArtifactRecord = {
        ...artifact,
        ownerPublicKey: expectedOwner,
        epoch: artifact.epoch + 1,
        status: 'transferred'
      };
      nextState = await store.update((s) => {
        const updated = {
          ...s,
          artifact: nextArtifact,
          currentOwner: expectedOwner,
          log: [`${new Date().toISOString()} Solana owner check confirmed transfer to ${expectedOwner}`, ...s.log]
        };
        delete updated.pendingTransferTo;
        delete updated.lastRuntimeResult;
        return updated;
      });
    }

    res.json({
      ok: true,
      nftMint: artifact.nftMint,
      expectedOwner,
      currentOwner,
      expectedOwnerOwnsNft,
      state: nextState
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/tamper/wrong-owner', async (_req, res) => {
  res.json({ ok: false, reason: 'This endpoint is a UI hook for the tamper demo. Connect a non-owner wallet before transfer.' });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? (error.message || error.name) : String(error);
  res.status(500).json({ ok: false, error: message });
});

app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
