import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from './jwt';

describe('JWT', () => {
  const payload = { userId: 'abc', familyId: 'fam', email: 'jan@test.de', role: 'owner' as const };

  it('signs and verifies a token', () => {
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe('abc');
    expect(decoded.familyId).toBe('fam');
  });

  it('throws on invalid token', () => {
    expect(() => verifyToken('not.a.token')).toThrow();
  });
});
