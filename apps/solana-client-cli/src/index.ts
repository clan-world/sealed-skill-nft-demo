import { config as loadEnv } from 'dotenv';
loadEnv({ path: '../../.env' });
import { loadOrCreateKeypair, makeConnection, requestDevnetAirdrop } from '@sealed-skill/solana';

const cmd = process.argv[2];
const keyPath = process.env.BACKEND_KEYPAIR_PATH ?? '../../data/solana/backend-keypair.json';
const rpc = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

if (!cmd) {
  console.log('Usage: pnpm --filter @sealed-skill/solana-client-cli start <keypair:init|solana:airdrop|solana:balance>');
  process.exit(0);
}

const kp = await loadOrCreateKeypair(keyPath);
const connection = makeConnection(rpc);

if (cmd === 'keypair:init') {
  console.log(`Backend keypair: ${keyPath}`);
  console.log(`Public key: ${kp.publicKey.toBase58()}`);
} else if (cmd === 'solana:airdrop') {
  console.log(`Requesting devnet airdrop for ${kp.publicKey.toBase58()}`);
  const sig = await requestDevnetAirdrop(connection, kp, 2);
  console.log(`Airdrop signature: ${sig}`);
} else if (cmd === 'solana:balance') {
  const lamports = await connection.getBalance(kp.publicKey);
  console.log(`${kp.publicKey.toBase58()} balance: ${lamports / 1_000_000_000} SOL`);
} else {
  throw new Error(`Unknown command: ${cmd}`);
}
