import type { DemoState, TeeRecord } from '@sealed-skill/protocol';

export type DemoPhase =
  | 'empty'
  | 'tees-registered'
  | 'artifact-created'
  | 'b-failed-before-transfer'
  | 'transfer-prepared'
  | 'transfer-complete'
  | 'b-succeeded-after-transfer';

export function getDemoPhase(state: DemoState): DemoPhase {
  if (state.lastRuntimeResult) return 'b-succeeded-after-transfer';
  if (state.artifact?.status === 'transferred') return 'transfer-complete';
  if (state.transferTranscript) return 'transfer-prepared';
  if (state.artifact) return 'artifact-created';
  if (state.tees.broker && state.tees.creator && state.tees.runtime) return 'tees-registered';
  return 'empty';
}

export function createEmptyDemoState(): DemoState {
  return { tees: {}, log: [] };
}

export function addLog(state: DemoState, message: string): DemoState {
  return { ...state, log: [`${new Date().toISOString()} ${message}`, ...state.log].slice(0, 100) };
}

export function mergeTee(state: DemoState, tee: TeeRecord): DemoState {
  return addLog({ ...state, tees: { ...state.tees, [tee.role]: tee } }, `Registered ${tee.role} TEE`);
}
