import { useCallback, useEffect, useMemo, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { canonicalJson, makeNonce, shortHash, type DemoState } from '@sealed-skill/protocol';
import { api } from './api.js';
import { InfoCard, StatusPill, TeePanel } from './components.js';
import { brokerStepLabels, creatorStepLabels, makeSteps, runtimeStepLabels, type VisualStep } from './steps.js';

type Busy = 'none' | 'reset' | 'register' | 'generate' | 'mint' | 'b-fail' | 'prepare' | 'ownership' | 'transfer' | 'b-run';

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

function solscanSearchUrl(value?: string): string | undefined {
  return value ? `https://solscan.io/search?q=${encodeURIComponent(value)}&cluster=devnet` : undefined;
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
  const [mintModalOpen, setMintModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [ownershipModalOpen, setOwnershipModalOpen] = useState(false);
  const [ownershipResult, setOwnershipResult] = useState<{
    nftMint: string;
    expectedOwner: string;
    currentOwner?: string;
    expectedOwnerOwnsNft: boolean;
  } | null>(null);
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
      setMintModalOpen(false);
      setTransferModalOpen(false);
      setOwnershipModalOpen(false);
      setOwnershipResult(null);
      setSuccess('Demo reset.');
    });
  }

  async function generateArtifact() {
    if (!walletAPubkey) throw new Error('Connect Wallet A first.');
    await runAction('generate', async () => {
      await animate(creatorStepLabels, setCreatorSteps, async () => {
        const result = await api<{ state: DemoState; mintSignature?: string }>('/api/artifacts/generate', { ownerPublicKey: walletAPubkey });
        setState(result.state);
        setSuccess('Sealed artifact created. Review the NFT mint payload in TEE2.');
      });
    });
  }

  async function mintArtifactNft() {
    await runAction('mint', async () => {
      const result = await api<{ state: DemoState; nftMint: string; mintSignature?: string }>('/api/artifacts/mint', {});
      setState(result.state);
      setMintModalOpen(false);
      setSuccess(`NFT minted to Wallet A: ${result.nftMint}`);
    });
  }

  async function walletBTryBeforeTransfer() {
    await runAction('b-fail', async () => {
      const steps = makeSteps(runtimeStepLabels);
      const artifact = state.artifact;
      if (!artifact?.nftMint) throw new Error('Generate artifact first.');
      steps[0] = { ...steps[0]!, state: 'running' };
      setRuntimeSteps([...steps]);
      await sleep(220);
      steps[0] = { ...steps[0]!, state: 'done' };
      steps[1] = { ...steps[1]!, state: 'running' };
      setRuntimeSteps([...steps]);

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
      steps[1] = { label: 'Rejected: Wallet B is not current NFT owner', state: 'error' };
      setRuntimeSteps([...steps]);
      setSuccess('Access blocked as expected: Wallet B cannot use the sealed artifact before transfer.');
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

  async function confirmTransferFromModal() {
    setTransferModalOpen(false);
    await completeTransfer();
  }

  async function checkWalletBOwnership() {
    setOwnershipModalOpen(true);
    setOwnershipResult(null);
    await runAction('ownership', async () => {
      const result = await api<{
        nftMint: string;
        expectedOwner: string;
        currentOwner?: string;
        expectedOwnerOwnsNft: boolean;
        state: DemoState;
      }>('/api/ownership/check', { expectedOwner: walletBPubkey });
      setOwnershipResult(result);
      setState(result.state);
      setSuccess(result.expectedOwnerOwnsNft ? 'Wallet B owns the NFT. Runtime access is now enabled.' : 'Wallet B does not own the NFT yet.');
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
  const canMint = Boolean(state.artifact && state.artifact.status === 'created' && walletAPubkey);
  const canTransfer = Boolean(state.transferTranscript && state.pendingTransferTo && state.artifact?.nftMint && walletAPubkey);
  const mintReview = {
    solanaAction: 'create mint, create associated token account, mint 1 token',
    mintAuthority: 'backend devnet payer',
    recipientWallet: state.artifact?.ownerPublicKey,
    scarceArtifactPointer: state.artifact?.encryptedBlob,
    sealedKeyForBroker: state.artifact?.sealedKeyForBroker,
    creatorTranscriptHash: state.creationTranscript?.payloadHash,
    runtimePolicy: state.artifact?.runtimePolicy
  };
  const transferReview = {
    solanaFunction: 'SPL Token transferChecked',
    nftMint: state.artifact?.nftMint,
    fromOwner: walletAPubkey,
    toOwner: state.pendingTransferTo ?? walletBPubkey,
    currentEpoch: state.artifact?.epoch,
    teeAuthorization: {
      kind: state.transferTranscript?.payload.kind,
      artifactId: state.transferTranscript?.payload.artifactId,
      nftMint: state.transferTranscript?.payload.nftMint,
      fromOwner: state.transferTranscript?.payload.fromOwner,
      toOwner: state.transferTranscript?.payload.toOwner,
      epoch: state.transferTranscript?.payload.epoch,
      nextEpoch: state.transferTranscript?.payload.nextEpoch,
      expiresAt: state.transferTranscript?.payload.expiresAt,
      payloadHash: state.transferTranscript?.payloadHash,
      brokerSigner: state.transferTranscript?.signerPublicKeyPem
    }
  };

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
        <button className="reset-button" onClick={resetDemo} disabled={busy !== 'none'}>Reset demo</button>
        <button onClick={registerTees} disabled={busy !== 'none'}>1. Register TEEs</button>
        <button onClick={generateArtifact} disabled={busy !== 'none' || !walletAPubkey}>2. Generate sealed animal artifact</button>
        <button onClick={walletBTryBeforeTransfer} disabled={busy !== 'none' || !state.artifact?.nftMint}>3. Confirm Wallet B is blocked</button>
        <button onClick={prepareTransfer} disabled={busy !== 'none' || !state.artifact?.nftMint || !walletAPubkey}>4. Prepare transfer A → B</button>
        <button onClick={checkWalletBOwnership} disabled={busy !== 'none' || !state.artifact?.nftMint}>5. Check Wallet B ownership</button>
        <button onClick={walletBRunAfterTransfer} disabled={busy !== 'none' || state.currentOwner !== walletBPubkey}>6. Wallet B asks runtime</button>
      </section>

      <section className="notices">
        {busy !== 'none' && <StatusPill ok text={`Processing: ${busy}`} />}
        {success && <StatusPill ok text={success} />}
        {error && <StatusPill text={error} />}
      </section>

      <section className="tee-grid">
        <TeePanel title="TEE1 Broker" subtitle="Key broker and transfer capsule service" accent="#9b5cff" steps={brokerSteps} publicKey={state.tees.broker?.signPublicKeyPem} measurement={state.tees.broker?.measurement}>
          {canTransfer && (
            <div className="tee-panel-actions">
              <button onClick={() => setTransferModalOpen(true)} disabled={busy !== 'none'}>Transfer NFT</button>
            </div>
          )}
        </TeePanel>
        <TeePanel title="TEE2 Creator" subtitle="Generates and encrypts the scarce artifact" accent="#13b981" steps={creatorSteps} publicKey={state.tees.creator?.signPublicKeyPem} measurement={state.tees.creator?.measurement} stepTones={{ 1: 'broker', 2: 'runtime', 7: 'runtime' }}>
          {canMint && (
            <div className="tee-panel-actions">
              <button onClick={() => setMintModalOpen(true)} disabled={busy !== 'none'}>Mint NFT</button>
            </div>
          )}
        </TeePanel>
        <TeePanel title="TEE3 Runtime" subtitle="Uses the artifact and returns allowed output" accent="#4f8cff" steps={runtimeSteps} publicKey={state.tees.runtime?.signPublicKeyPem} measurement={state.tees.runtime?.measurement} />
      </section>

      {mintModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setMintModalOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="mint-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">NFT mint payload</p>
                <h2 id="mint-modal-title">Mint NFT</h2>
              </div>
              <button className="icon-button" onClick={() => setMintModalOpen(false)} aria-label="Close mint review">x</button>
            </div>
            <pre className="modal-data">{JSON.stringify(mintReview, null, 2)}</pre>
            <div className="modal-actions">
              <button className="reset-button" onClick={() => setMintModalOpen(false)} disabled={busy !== 'none'}>Cancel</button>
              <button onClick={mintArtifactNft} disabled={busy !== 'none' || !canMint}>Mint</button>
            </div>
          </section>
        </div>
      )}

      {transferModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setTransferModalOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="transfer-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Broker TEE authorization</p>
                <h2 id="transfer-modal-title">Transfer NFT</h2>
              </div>
              <button className="icon-button" onClick={() => setTransferModalOpen(false)} aria-label="Close transfer review">x</button>
            </div>
            <pre className="modal-data">{JSON.stringify(transferReview, null, 2)}</pre>
            <div className="modal-actions">
              <button className="reset-button" onClick={() => setTransferModalOpen(false)} disabled={busy !== 'none'}>Cancel</button>
              <button onClick={confirmTransferFromModal} disabled={busy !== 'none' || !canTransfer}>Transfer</button>
            </div>
          </section>
        </div>
      )}

      {ownershipModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setOwnershipModalOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="ownership-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Solana devnet owner check</p>
                <h2 id="ownership-modal-title">Wallet B Ownership</h2>
              </div>
              <button className="icon-button" onClick={() => setOwnershipModalOpen(false)} aria-label="Close ownership check">x</button>
            </div>
            <div className={`ownership-result ${ownershipResult?.expectedOwnerOwnsNft ? 'ok' : 'warn'}`}>
              {busy === 'ownership'
                ? 'Checking Solana devnet...'
                : ownershipResult?.expectedOwnerOwnsNft
                  ? 'Yes. Wallet B owns this NFT.'
                  : 'No. Wallet B does not own this NFT yet.'}
            </div>
            <pre className="modal-data">{JSON.stringify({
              nftMint: ownershipResult?.nftMint ?? state.artifact?.nftMint,
              walletB: walletBPubkey,
              currentSolanaOwner: ownershipResult?.currentOwner,
              walletBOwnsNft: ownershipResult?.expectedOwnerOwnsNft ?? false
            }, null, 2)}</pre>
            <div className="modal-actions">
              <button onClick={checkWalletBOwnership} disabled={busy !== 'none'}>Check again</button>
              <button className="reset-button" onClick={() => setOwnershipModalOpen(false)} disabled={busy !== 'none'}>Close</button>
            </div>
          </section>
        </div>
      )}

      <section className="audit-grid">
        <div className="transcripts">
          <h2>Signed transcript hashes</h2>
          <div className="transcript-stack">
            <InfoCard label="Creation transcript" value={state.creationTranscript?.payloadHash} href={solscanSearchUrl(state.creationTranscript?.payloadHash)} />
            <InfoCard label="Transfer transcript" value={state.transferTranscript?.payloadHash} href={solscanSearchUrl(state.transferTranscript?.payloadHash)} />
            <InfoCard label="Runtime transcript" value={state.lastRuntimeResult?.transcript.payloadHash} href={solscanSearchUrl(state.lastRuntimeResult?.transcript.payloadHash)} />
          </div>
        </div>

        <div className="log">
          <h2>Event log</h2>
          <pre>{state.log?.join('\n') || 'No events yet.'}</pre>
        </div>
      </section>
    </main>
  );
}
