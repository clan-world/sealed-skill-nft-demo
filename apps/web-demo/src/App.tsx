import { useCallback, useEffect, useMemo, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { canonicalJson, makeNonce, shortHash, type DemoState } from '@sealed-skill/protocol';
import { api } from './api.js';
import { InfoCard, StatusPill, TeePanel } from './components.js';
import { brokerStepLabels, creatorStepLabels, makeSteps, runtimeStepLabels, type VisualStep } from './steps.js';

type Busy = 'none' | 'reset' | 'register' | 'generate' | 'b-fail' | 'prepare' | 'transfer' | 'b-run';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function animate(labels: string[], setSteps: (steps: VisualStep[]) => void, work: () => Promise<void>) {
  const steps = makeSteps(labels);
  setSteps([...steps]);
  for (let i = 0; i < labels.length; i++) {
    steps[i] = { ...steps[i]!, state: 'running' };
    setSteps([...steps]);
    await sleep(220);
    steps[i] = { ...steps[i]!, state: 'done' };
    setSteps([...steps]);
  }
  await work();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function signWithKeypair(kp: Keypair, message: unknown): string {
  const bytes = new TextEncoder().encode(canonicalJson(message));
  return bytesToBase64(nacl.sign.detached(bytes, kp.secretKey));
}

export function App() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [state, setState] = useState<DemoState>({ tees: {}, log: [] });
  const [busy, setBusy] = useState<Busy>('none');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [creatorSteps, setCreatorSteps] = useState(makeSteps(creatorStepLabels));
  const [brokerSteps, setBrokerSteps] = useState(makeSteps(brokerStepLabels));
  const [runtimeSteps, setRuntimeSteps] = useState(makeSteps(runtimeStepLabels));
  const [walletB] = useState(() => Keypair.generate());

  const walletAPubkey = wallet.publicKey?.toBase58();
  const walletBPubkey = useMemo(() => walletB.publicKey.toBase58(), [walletB]);

  const refresh = useCallback(async () => {
    const next = await api<DemoState>('/api/demo-state');
    setState(next);
  }, []);

  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);

  async function runAction(name: Busy, fn: () => Promise<void>) {
    setBusy(name);
    setError('');
    setSuccess('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('none');
    }
  }

  async function registerTees() {
    await runAction('register', async () => {
      const next = await api<DemoState>('/api/tees/register', {});
      setState(next);
      setSuccess('Three mock-attested TEEs registered.');
    });
  }

  async function resetDemo() {
    await runAction('reset', async () => {
      const next = await api<DemoState>('/api/demo/reset', {});
      setState(next);
      setCreatorSteps(makeSteps(creatorStepLabels));
      setBrokerSteps(makeSteps(brokerStepLabels));
      setRuntimeSteps(makeSteps(runtimeStepLabels));
      setSuccess('Demo reset.');
    });
  }

  async function generateArtifact() {
    if (!walletAPubkey) throw new Error('Connect Wallet A first.');
    await runAction('generate', async () => {
      await animate(creatorStepLabels, setCreatorSteps, async () => {
        const result = await api<{ state: DemoState; mintSignature?: string }>('/api/artifacts/generate', { ownerPublicKey: walletAPubkey });
        setState(result.state);
        setSuccess(`Sealed artifact created. NFT mint: ${result.state.artifact?.nftMint ?? 'mock'}`);
      });
    });
  }

  async function walletBTryBeforeTransfer() {
    await runAction('b-fail', async () => {
      await animate(runtimeStepLabels.slice(0, 2), setRuntimeSteps, async () => {
        const artifact = state.artifact;
        if (!artifact?.nftMint) throw new Error('Generate artifact first.');
        const message = {
          kind: 'runtime-request', artifactId: artifact.artifactId, nftMint: artifact.nftMint,
          callerPublicKey: walletBPubkey, prompt: 'what sound does this animal make?', epoch: artifact.epoch, nonce: makeNonce('web-b-fail')
        };
        const signatureB64 = signWithKeypair(walletB, message);
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/access/run`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callerPublicKey: walletBPubkey, prompt: message.prompt, message, signatureB64 })
        });
        const json = await res.json();
        if (res.status !== 403) throw new Error(`Expected Wallet B to fail before transfer. Got: ${JSON.stringify(json)}`);
        setSuccess('Correct: Wallet B was rejected before transfer.');
      });
    });
  }

  async function prepareTransfer() {
    if (!walletAPubkey) throw new Error('Connect Wallet A first.');
    await runAction('prepare', async () => {
      await animate(brokerStepLabels, setBrokerSteps, async () => {
        const result = await api<{ state: DemoState }>('/api/transfer/prepare', { fromPublicKey: walletAPubkey, toPublicKey: walletBPubkey });
        setState(result.state);
        setSuccess('Broker TEE created owner-bound transfer capsule for Wallet B.');
      });
    });
  }

  async function completeTransfer() {
    if (!walletAPubkey || !wallet.publicKey) throw new Error('Connect Wallet A first.');
    await runAction('transfer', async () => {
      const artifact = state.artifact;
      if (!artifact?.nftMint) throw new Error('Generate artifact first.');
      if (artifact.nftMint.startsWith('mock_')) {
        const completed = await api<{ state: DemoState }>('/api/transfer/complete', { toPublicKey: walletBPubkey });
        setState(completed.state);
        setSuccess('Mock transfer completed. Enable SOLANA_ENABLED=true for devnet token transfer.');
        return;
      }
      const built = await api<{ txBase64: string }>('/api/transfer/build', { fromPublicKey: walletAPubkey, toPublicKey: walletBPubkey });
      const tx = Transaction.from(base64ToBytes(built.txBase64));
      if (!wallet.signTransaction) throw new Error('Connected wallet does not support transaction signing.');
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      const completed = await api<{ state: DemoState }>('/api/transfer/complete', { toPublicKey: walletBPubkey, signature: sig });
      setState(completed.state);
      setSuccess(`Solana transfer complete: ${sig}`);
    });
  }

  async function walletBRunAfterTransfer() {
    await runAction('b-run', async () => {
      await animate(runtimeStepLabels, setRuntimeSteps, async () => {
        const artifact = state.artifact;
        if (!artifact?.nftMint) throw new Error('Generate artifact first.');
        const message = {
          kind: 'runtime-request', artifactId: artifact.artifactId, nftMint: artifact.nftMint,
          callerPublicKey: walletBPubkey, prompt: 'what sound does this animal make?', epoch: artifact.epoch, nonce: makeNonce('web-b-run')
        };
        const signatureB64 = signWithKeypair(walletB, message);
        const result = await api<{ ok: boolean; result: { output: string }; state: DemoState }>('/api/access/run', { callerPublicKey: walletBPubkey, prompt: message.prompt, message, signatureB64 });
        setState(result.state);
        setSuccess(`Runtime output: ${result.result.output}`);
      });
    });
  }

  const artifactHash = state.artifact?.encryptedBlob.sha256;
  const sealedKeyHash = state.artifact?.sealedKeyForBroker?.aadHash;

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Solana + TEE-gated sealed data</p>
          <h1>Sealed Skill NFT Demo</h1>
          <p>The NFT controls a hidden animal artifact. Owners can use it through the runtime, but cannot read or copy the plaintext.</p>
        </div>
        <WalletMultiButton />
      </header>

      <section className="wallet-grid">
        <InfoCard label="Wallet A" value={walletAPubkey ?? 'connect wallet'} />
        <InfoCard label="Wallet B demo key" value={walletBPubkey} />
        <InfoCard label="Current owner" value={state.currentOwner} />
        <InfoCard label="NFT mint" value={state.artifact?.nftMint} />
        <InfoCard label="Encrypted artifact hash" value={artifactHash ? shortHash(artifactHash, 18) : undefined} />
        <InfoCard label="Sealed key hash" value={sealedKeyHash ? shortHash(sealedKeyHash, 18) : undefined} />
        <InfoCard label="Plaintext animal" hidden />
        <InfoCard label="Runtime output" value={state.lastRuntimeResult?.output} />
      </section>

      <section className="actions">
        <button onClick={resetDemo} disabled={busy !== 'none'}>Reset demo</button>
        <button onClick={registerTees} disabled={busy !== 'none'}>1. Register TEEs</button>
        <button onClick={generateArtifact} disabled={busy !== 'none' || !walletAPubkey}>2. Generate sealed animal artifact</button>
        <button onClick={walletBTryBeforeTransfer} disabled={busy !== 'none' || !state.artifact}>3. Wallet B tries before transfer</button>
        <button onClick={prepareTransfer} disabled={busy !== 'none' || !state.artifact || !walletAPubkey}>4. Prepare transfer A → B</button>
        <button onClick={completeTransfer} disabled={busy !== 'none' || !state.transferTranscript}>5. Complete transfer on Solana</button>
        <button onClick={walletBRunAfterTransfer} disabled={busy !== 'none' || state.currentOwner !== walletBPubkey}>6. Wallet B asks runtime</button>
      </section>

      <section className="notices">
        {busy !== 'none' && <StatusPill ok text={`Processing: ${busy}`} />}
        {success && <StatusPill ok text={success} />}
        {error && <StatusPill text={error} />}
      </section>

      <section className="tee-grid">
        <TeePanel title="TEE1 Broker" subtitle="Key broker and transfer capsule service" accent="#9b5cff" steps={brokerSteps} publicKey={state.tees.broker?.signPublicKeyPem} measurement={state.tees.broker?.measurement} />
        <TeePanel title="TEE2 Creator" subtitle="Generates and encrypts the scarce artifact" accent="#13b981" steps={creatorSteps} publicKey={state.tees.creator?.signPublicKeyPem} measurement={state.tees.creator?.measurement} />
        <TeePanel title="TEE3 Runtime" subtitle="Uses the artifact and returns allowed output" accent="#4f8cff" steps={runtimeSteps} publicKey={state.tees.runtime?.signPublicKeyPem} measurement={state.tees.runtime?.measurement} />
      </section>

      <section className="transcripts">
        <h2>Signed transcript hashes</h2>
        <div className="wallet-grid">
          <InfoCard label="Creation transcript" value={state.creationTranscript?.payloadHash ? shortHash(state.creationTranscript.payloadHash, 18) : undefined} />
          <InfoCard label="Transfer transcript" value={state.transferTranscript?.payloadHash ? shortHash(state.transferTranscript.payloadHash, 18) : undefined} />
          <InfoCard label="Runtime transcript" value={state.lastRuntimeResult?.transcript.payloadHash ? shortHash(state.lastRuntimeResult.transcript.payloadHash, 18) : undefined} />
        </div>
      </section>

      <section className="log">
        <h2>Event log</h2>
        <pre>{state.log?.join('\n') || 'No events yet.'}</pre>
      </section>
    </main>
  );
}
