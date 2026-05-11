export type StepState = 'idle' | 'running' | 'done' | 'error';

export interface VisualStep {
  label: string;
  state: StepState;
}

export const creatorStepLabels = [
  'Receive prompt: choose a random animal',
  'Read Broker TEE public key',
  'Read Runtime TEE policy',
  'Generate hidden animal artifact',
  'Generate symmetric data key',
  'Encrypt artifact with symmetric key',
  'Save encrypted artifact blob',
  'Seal key to Broker TEE',
  'Sign creation transcript',
  'Mint demo NFT to Wallet A'
];

export const brokerStepLabels = [
  'Receive transfer request',
  'Check current owner is Wallet A',
  'Unwrap artifact key inside Broker TEE',
  'Create owner-bound transfer capsule',
  'Bind capsule to Wallet B and epoch',
  'Sign transfer transcript',
  'Return capsule to Solana transfer flow'
];

export const runtimeStepLabels = [
  'Receive signed runtime request',
  'Check caller owns NFT',
  'Create short-lived runtime session key',
  'Ask Broker TEE for session-wrapped artifact key',
  'Fetch encrypted artifact',
  'Decrypt artifact inside Runtime TEE',
  'Apply output policy',
  'Return allowed animal sound only'
];

export function makeSteps(labels: string[]): VisualStep[] {
  return labels.map((label) => ({ label, state: 'idle' }));
}
