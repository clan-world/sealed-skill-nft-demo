import { useCallback, useEffect, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { canonicalJson, makeNonce, shortHash, type DemoState } from '@sealed-skill/protocol';
import { api } from './api.js';
import { InfoCard, StatusPill, TeePanel } from './components.js';
import { brokerStepLabels, creatorStepLabels, makeSteps, runtimeStepLabels, type VisualStep } from './steps.js';

type Busy = 'none' | 'reset' | 'register' | 'generate' | 'mint' | 'runtime' | 'prepare' | 'ownership' | 'transfer';

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

function solscanSearchUrl(value?: string): string | undefined {
  return value ? `https://solscan.io/search?q=${encodeURIComponent(value)}&cluster=devnet` : undefined;
}

function assertPublicKey(value: string, label: string) {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana wallet address.`);
  }
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
  const [recipientPublicKey, setRecipientPublicKey] = useState('');

  const connectedPubkey = wallet.publicKey?.toBase58();
  const recipient = recipientPublicKey.trim();
  const preparedRecipient = state.pendingTransferTo ?? recipient;

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

  async function signWithConnectedWallet(message: unknown): Promise<string> {
    if (!connectedPubkey) throw new Error('Connect a wallet first.');
    if (!wallet.signMessage) throw new Error('Connected wallet does not support message signing.');
    const bytes = new TextEncoder().encode(canonicalJson(message));
    const sig = await wallet.signMessage(bytes);
    return bytesToBase64(sig);
  }

  async function generateArtifact() {
    if (!connectedPubkey) throw new Error('Connect wallet A first.');
    await runAction('generate', async () => {
      await animate(creatorStepLabels, setCreatorSteps, async () => {
        const result = await api<{ state: DemoState; mintSignature?: string }>('/api/artifacts/generate', { ownerPublicKey: connectedPubkey });
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
      setSuccess(`NFT minted to ${state.artifact?.ownerPublicKey ?? 'the artifact owner'}: ${result.nftMint}`);
    });
  }

  async function runRuntimeAsConnectedWallet() {
    if (!connectedPubkey) throw new Error('Connect the wallet you want to test.');
    await runAction('runtime', async () => {
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
        callerPublicKey: connectedPubkey, prompt: 'what sound does this animal make?', epoch: artifact.epoch, nonce: makeNonce('web-runtime')
      };
      const signatureB64 = await signWithConnectedWallet(message);
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/access/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callerPublicKey: connectedPubkey, prompt: message.prompt, message, signatureB64 })
      });
      const json = await res.json();
      if (res.status === 403) {
        steps[1] = { label: 'Rejected: connected wallet is not current NFT owner', state: 'error' };
        setRuntimeSteps([...steps]);
        setSuccess('Access blocked: connected wallet is not the current NFT owner.');
        return;
      }
      if (!res.ok) throw new Error(json.error ?? json.reason ?? `Runtime request failed with HTTP ${res.status}`);
      steps[1] = { ...steps[1]!, state: 'done' };
      setRuntimeSteps([...steps]);
      for (let i = 2; i < runtimeStepLabels.length; i++) {
        steps[i] = { ...steps[i]!, state: 'running' };
        setRuntimeSteps([...steps]);
        await sleep(220);
        steps[i] = { ...steps[i]!, state: 'done' };
        setRuntimeSteps([...steps]);
      }
      setState(json.state);
      setSuccess(`Runtime output: ${json.result.output}`);
    });
  }

  async function prepareTransfer() {
    await runAction('prepare', async () => {
      if (!connectedPubkey) throw new Error('Connect the current NFT owner first.');
      if (!recipient) {
        const steps = makeSteps(brokerStepLabels);
        setBrokerSteps([...steps]);
        for (let i = 0; i < 4; i++) {
          steps[i] = { ...steps[i]!, state: 'running' };
          setBrokerSteps([...steps]);
          await sleep(220);
          steps[i] = { ...steps[i]!, state: 'done' };
          setBrokerSteps([...steps]);
        }
        steps[4] = { ...steps[4]!, state: 'error' };
        setBrokerSteps([...steps]);
        throw new Error('Recipient wallet required before binding capsule.');
      }
      const toPublicKey = assertPublicKey(recipient, 'Recipient wallet');
      if (toPublicKey === connectedPubkey) throw new Error('Recipient must be a different wallet from the connected owner.');
      await animate(brokerStepLabels, setBrokerSteps, async () => {
        const result = await api<{ state: DemoState }>('/api/transfer/prepare', { fromPublicKey: connectedPubkey, toPublicKey });
        setState(result.state);
        setSuccess('Broker TEE created owner-bound transfer capsule for the recipient.');
      });
    });
  }

  async function completeTransfer() {
    await runAction('transfer', async () => {
      if (!connectedPubkey || !wallet.publicKey) throw new Error('Connect the current NFT owner first.');
      const toPublicKey = assertPublicKey(preparedRecipient, 'Prepared recipient');
      const artifact = state.artifact;
      if (!artifact?.nftMint) throw new Error('Generate artifact first.');
      if (artifact.nftMint.startsWith('mock_')) {
        const completed = await api<{ state: DemoState }>('/api/transfer/complete', { toPublicKey });
        setState(completed.state);
        setSuccess('Mock transfer completed. Enable SOLANA_ENABLED=true for devnet token transfer.');
        return;
      }
      const built = await api<{ txBase64: string }>('/api/transfer/build', { fromPublicKey: connectedPubkey, toPublicKey });
      const tx = Transaction.from(base64ToBytes(built.txBase64));
      if (!wallet.signTransaction) throw new Error('Connected wallet does not support transaction signing.');
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      const completed = await api<{ state: DemoState }>('/api/transfer/complete', { toPublicKey, signature: sig });
      setState(completed.state);
      setSuccess(`Solana transfer complete: ${sig}`);
    });
  }

  async function confirmTransferFromModal() {
    setTransferModalOpen(false);
    await completeTransfer();
  }

  async function checkRecipientOwnership() {
    setOwnershipModalOpen(true);
    setOwnershipResult(null);
    await runAction('ownership', async () => {
      const expectedOwner = assertPublicKey(preparedRecipient, 'Recipient wallet');
      const result = await api<{
        nftMint: string;
        expectedOwner: string;
        currentOwner?: string;
        expectedOwnerOwnsNft: boolean;
        state: DemoState;
      }>('/api/ownership/check', { expectedOwner });
      setOwnershipResult(result);
      setState(result.state);
      setSuccess(result.expectedOwnerOwnsNft ? 'Recipient owns the NFT. Runtime access is now enabled for that connected wallet.' : 'Recipient does not own the NFT yet.');
    });
  }

  const artifactHash = state.artifact?.encryptedBlob.sha256;
  const sealedKeyHash = state.artifact?.sealedKeyForBroker?.aadHash;
  const canMint = Boolean(state.artifact && state.artifact.status === 'created' && connectedPubkey);
  const canTransfer = Boolean(state.transferTranscript && state.pendingTransferTo && state.artifact?.nftMint && connectedPubkey);
  const mintReview = {
    solanaAction: 'create Token-2022 collectible mint, attach metadata/group/hook extensions, mint 1 token',
    mintAuthority: 'backend devnet payer',
    recipientWallet: state.artifact?.ownerPublicKey,
    tokenProgram: state.artifact?.tokenProgram,
    collectionMint: state.artifact?.collectionMint,
    metadataUri: state.artifact?.metadataUri,
    transferHookProgram: state.artifact?.hookProgramId,
    artifactGatePda: state.artifact?.artifactPda,
    scarceArtifactPointer: state.artifact?.encryptedBlob,
    sealedKeyForBroker: state.artifact?.sealedKeyForBroker,
    creatorTranscriptHash: state.creationTranscript?.payloadHash,
    runtimePolicy: state.artifact?.runtimePolicy
  };
  const transferReview = {
    solanaFunction: 'Token-2022 transferChecked with sealed-skill transfer hook',
    nftMint: state.artifact?.nftMint,
    tokenProgram: state.artifact?.tokenProgram,
    transferHookProgram: state.artifact?.hookProgramId,
    artifactGatePda: state.artifact?.artifactPda,
    approvalPda: state.artifact?.approvalPda,
    fromOwner: connectedPubkey,
    toOwner: preparedRecipient,
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
        <InfoCard label="Connected wallet" value={connectedPubkey ?? 'connect wallet'} />
        <InfoCard label="Transfer recipient" value={recipient || 'enter recipient wallet'} />
        <InfoCard label="Current owner" value={state.currentOwner} />
        <InfoCard label="NFT mint" value={state.artifact?.nftMint} />
        <InfoCard label="Token program" value={state.artifact?.tokenProgram} />
        <InfoCard label="Hook program" value={state.artifact?.hookProgramId} />
        <InfoCard label="Encrypted artifact hash" value={artifactHash ? shortHash(artifactHash, 18) : undefined} />
        <InfoCard label="Sealed key hash" value={sealedKeyHash ? shortHash(sealedKeyHash, 18) : undefined} />
        <InfoCard label="Plaintext animal" hidden />
        <InfoCard label="Runtime output" value={state.lastRuntimeResult?.output} />
      </section>

      <section className="actions">
        <button className="reset-button" onClick={resetDemo} disabled={busy !== 'none'}>Reset demo</button>
        <button onClick={registerTees} disabled={busy !== 'none'}>1. Register TEEs</button>
        <button onClick={generateArtifact} disabled={busy !== 'none' || !connectedPubkey}>2. Generate sealed animal artifact</button>
        <button onClick={runRuntimeAsConnectedWallet} disabled={busy !== 'none' || !state.artifact?.nftMint || !connectedPubkey}>3. Connected wallet asks runtime</button>
        <button onClick={prepareTransfer} disabled={busy !== 'none' || !state.artifact?.nftMint || !connectedPubkey}>4. Prepare broker transfer</button>
        <button onClick={checkRecipientOwnership} disabled={busy !== 'none' || !state.artifact?.nftMint || !preparedRecipient}>5. Check recipient ownership</button>
        <button onClick={runRuntimeAsConnectedWallet} disabled={busy !== 'none' || !state.artifact?.nftMint || !connectedPubkey}>6. Connected wallet asks runtime</button>
      </section>

      <section className="notices">
        {busy !== 'none' && <StatusPill ok text={`Processing: ${busy}`} />}
        {success && <StatusPill ok text={success} />}
        {error && <StatusPill text={error} />}
      </section>

      <section className="tee-grid">
        <TeePanel title="NFT Transfer Key Broker" subtitle="Key broker and transfer capsule service" accent="#9b5cff" chipLabel="TEE1" steps={brokerSteps} publicKey={state.tees.broker?.signPublicKeyPem} measurement={state.tees.broker?.measurement} stepTones={{ 2: 'broker' }}>
          <div className="tee-panel-actions recipient-transfer-row">
            <input
              aria-label="Transfer recipient wallet"
              className="recipient-input"
              placeholder="Recipient wallet address"
              value={recipientPublicKey}
              onChange={(event) => setRecipientPublicKey(event.target.value)}
              disabled={busy !== 'none'}
            />
            {canTransfer && (
              <button onClick={() => setTransferModalOpen(true)} disabled={busy !== 'none'}>Transfer NFT</button>
            )}
          </div>
        </TeePanel>
        <TeePanel title="Scarce Artifact Creator" subtitle="Generates and encrypts a random animal, scarce artifact" accent="#13b981" chipLabel="TEE2" steps={creatorSteps} publicKey={state.tees.creator?.signPublicKeyPem} measurement={state.tees.creator?.measurement} stepTones={{ 1: 'broker', 2: 'runtime', 3: 'creator', 4: 'creator', 5: 'creator', 6: 'creator', 7: 'broker' }}>
          {canMint && (
            <div className="tee-panel-actions">
              <button onClick={() => setMintModalOpen(true)} disabled={busy !== 'none'}>Mint NFT</button>
            </div>
          )}
        </TeePanel>
        <TeePanel title="Approved Execution Runtime" subtitle="Uses the artifact and returns allowed output" accent="#4f8cff" chipLabel="TEE3" steps={runtimeSteps} publicKey={state.tees.runtime?.signPublicKeyPem} measurement={state.tees.runtime?.measurement} stepTones={{ 1: 'broker', 3: 'broker', 4: 'creator' }} />
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
                <h2 id="ownership-modal-title">Recipient Ownership</h2>
              </div>
              <button className="icon-button" onClick={() => setOwnershipModalOpen(false)} aria-label="Close ownership check">x</button>
            </div>
            <div className={`ownership-result ${ownershipResult?.expectedOwnerOwnsNft ? 'ok' : 'warn'}`}>
              {busy === 'ownership'
                ? 'Checking Solana devnet...'
                : ownershipResult?.expectedOwnerOwnsNft
                  ? 'Yes. The recipient owns this NFT.'
                  : 'No. The recipient does not own this NFT yet.'}
            </div>
            <pre className="modal-data">{JSON.stringify({
              nftMint: ownershipResult?.nftMint ?? state.artifact?.nftMint,
              recipient: ownershipResult?.expectedOwner ?? preparedRecipient,
              currentSolanaOwner: ownershipResult?.currentOwner,
              recipientOwnsNft: ownershipResult?.expectedOwnerOwnsNft ?? false
            }, null, 2)}</pre>
            <div className="modal-actions">
              <button onClick={checkRecipientOwnership} disabled={busy !== 'none'}>Check again</button>
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
