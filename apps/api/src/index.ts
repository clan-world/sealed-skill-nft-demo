import { config as loadEnv } from 'dotenv';
loadEnv({ path: '../../.env' });
import express from 'express';
import cors from 'cors';
import nacl from 'tweetnacl';
import { PublicKey, Transaction } from '@solana/web3.js';
import { canonicalJson, hashJson, type ArtifactRecord, type SignedEnvelope, type TeeRecord } from '@sealed-skill/protocol';
import { fetchJson } from '@sealed-skill/tee-common';
import { mergeTee } from '@sealed-skill/demo-state';
import { buildDemoNftTransferTx, getCurrentDemoNftOwner, loadOrCreateKeypair, makeConnection, mintOneSupplyDemoNft } from '@sealed-skill/solana';
import { StateStore } from './state.js';

const port = Number(process.env.API_PORT ?? 8787);
const dataDir = process.env.DEMO_DATA_DIR ?? '../../data';
const solanaEnabled = (process.env.SOLANA_ENABLED ?? 'false') === 'true';
const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const backendKeypairPath = process.env.BACKEND_KEYPAIR_PATH ?? `${dataDir}/solana/backend-keypair.json`;
const teeBrokerUrl = process.env.TEE_BROKER_URL ?? 'http://localhost:4101';
const teeCreatorUrl = process.env.TEE_CREATOR_URL ?? 'http://localhost:4102';
const teeRuntimeUrl = process.env.TEE_RUNTIME_URL ?? 'http://localhost:4103';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
const store = new StateStore(`${dataDir}/demo-state.json`);
const connection = makeConnection(rpcUrl);

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
  res.json({ ok: true, solanaEnabled, rpcUrl, teeBrokerUrl, teeCreatorUrl, teeRuntimeUrl });
});

app.get('/api/demo-state', async (_req, res) => {
  res.json(await store.read());
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

    let mintSignature: string | undefined;
    let nftMint: string | undefined;
    if (solanaEnabled) {
      const payer = await loadOrCreateKeypair(backendKeypairPath);
      const minted = await mintOneSupplyDemoNft({ connection, payer, owner: new PublicKey(ownerPublicKey) });
      nftMint = minted.mint.toBase58();
      mintSignature = minted.signature;
    } else {
      nftMint = `mock_mint_${created.artifact.artifactId}`;
    }

    const artifact: ArtifactRecord = { ...created.artifact, nftMint, status: 'minted' };
    const next = await store.update((s) => {
      const nextState = {
        ...s,
        tees: { ...s.tees, broker, creator, runtime },
        artifact,
        creationTranscript: created.transcript,
        currentOwner: ownerPublicKey,
        log: [`${new Date().toISOString()} Artifact generated and NFT minted: ${nftMint}`, ...s.log]
      };
      delete nextState.transferTranscript;
      delete nextState.lastRuntimeResult;
      delete nextState.pendingTransferTo;
      return nextState;
    });

    res.json({ state: next, mintSignature });
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
    if (!currentOwner) throw new Error('Cannot resolve current NFT owner');
    if (currentOwner !== callerPublicKey) {
      res.status(403).json({
        ok: false,
        reason: 'caller is not current NFT owner',
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
    if (!artifact.nftMint) throw new Error('artifact has no NFT mint');
    const currentOwner = await resolveCurrentOwner(artifact, state.currentOwner);
    if (currentOwner !== fromPublicKey) throw new Error(`fromPublicKey is not current owner. current=${currentOwner}`);

    const brokered = await fetchJson<{
      transcript: SignedEnvelope<any>;
      capsule: SignedEnvelope<any>;
    }>(`${teeBrokerUrl}/prepare-transfer`, {
      method: 'POST',
      body: JSON.stringify({ artifact, nftMint: artifact.nftMint, fromOwner: fromPublicKey, toOwner: toPublicKey })
    });

    const next = await store.update((s) => ({
      ...s,
      transferTranscript: brokered.transcript,
      pendingTransferTo: toPublicKey,
      log: [`${new Date().toISOString()} Transfer prepared from ${fromPublicKey} to ${toPublicKey}`, ...s.log]
    }));
    res.json({ ok: true, ...brokered, state: next });
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
    if (!artifact.nftMint) throw new Error('artifact has no NFT mint');
    if (state.pendingTransferTo !== toPublicKey.toBase58()) throw new Error('No prepared transfer for this recipient');
    if (!solanaEnabled) {
      res.json({ mock: true, message: 'SOLANA_ENABLED=false; call /api/transfer/complete directly.' });
      return;
    }
    const tx = await buildDemoNftTransferTx({ connection, mint: new PublicKey(artifact.nftMint), fromOwner: fromPublicKey, toOwner: toPublicKey });
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
    if (!artifact.nftMint) throw new Error('artifact has no NFT mint');
    if (state.pendingTransferTo !== toPublicKey) throw new Error('No prepared transfer for this recipient');

    if (solanaEnabled) {
      const currentOwner = await resolveCurrentOwner(artifact, state.currentOwner);
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

app.post('/api/tamper/wrong-owner', async (_req, res) => {
  res.json({ ok: false, reason: 'This endpoint is a UI hook for the tamper demo. Use Wallet B before transfer.' });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ ok: false, error: message });
});

app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
