import { hashJson, nowIso, type AttestationMode, type TeeRole } from '@sealed-skill/protocol';

export interface MockAttestation {
  mode: AttestationMode;
  role: TeeRole;
  measurement: string;
  issuedAt: string;
  statement: string;
}

export function createMockAttestation(input: {
  role: TeeRole;
  serviceName: string;
  signPublicKeyPem: string;
  wrapPublicKeyPem: string;
  version: string;
}): MockAttestation {
  const measurement = hashJson({
    role: input.role,
    serviceName: input.serviceName,
    signPublicKeyPem: input.signPublicKeyPem,
    wrapPublicKeyPem: input.wrapPublicKeyPem,
    version: input.version
  });
  return {
    mode: 'mock',
    role: input.role,
    measurement,
    issuedAt: nowIso(),
    statement: 'Mock attestation for demo only. Replace with Automata DCAP or zkVM-compressed attestation for production.'
  };
}

export function verifyMockAttestation(attestation: MockAttestation): boolean {
  return attestation.mode === 'mock' && attestation.measurement.length === 64;
}
