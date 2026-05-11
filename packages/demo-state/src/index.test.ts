import { describe, expect, it } from 'vitest';
import { createEmptyDemoState, getDemoPhase, mergeTee } from './index.js';

describe('demo state machine', () => {
  it('starts empty and advances after TEE registration', () => {
    let state = createEmptyDemoState();
    expect(getDemoPhase(state)).toBe('empty');
    state = mergeTee(state, {
      role: 'broker', serviceUrl: 'x', signPublicKeyPem: 's', wrapPublicKeyPem: 'w', measurement: 'm', attestationMode: 'mock', attestation: {}, expiresAt: new Date().toISOString(), revoked: false
    });
    expect(getDemoPhase(state)).toBe('empty');
  });
});
