import { describe, expect, it } from 'vitest';
import { canonicalJson, hashJson, isExpired } from './index.js';

describe('protocol canonical hashing', () => {
  it('hashes objects deterministically regardless of key order', () => {
    const a = { z: 1, a: { b: 2, a: 1 } };
    const b = { a: { a: 1, b: 2 }, z: 1 };
    expect(canonicalJson(a)).toEqual(canonicalJson(b));
    expect(hashJson(a)).toEqual(hashJson(b));
  });

  it('detects expired timestamps', () => {
    expect(isExpired('2000-01-01T00:00:00.000Z')).toBe(true);
  });
});
