import { describe, it, expect } from 'bun:test';
import { isNoAuthAllowed } from '../common/auth-policy';

describe('keyless-access policy', () => {
  it('fails closed when the variable is unset', () => {
    expect(isNoAuthAllowed({})).toBe(false);
  });

  it('allows keyless access only on an explicit true', () => {
    expect(isNoAuthAllowed({ BUNWA_ALLOW_NO_AUTH: 'true' })).toBe(true);
  });

  it('treats false and every other spelling as closed', () => {
    for (const value of ['false', '1', 'yes', 'TRUE', '']) {
      expect(isNoAuthAllowed({ BUNWA_ALLOW_NO_AUTH: value })).toBe(false);
    }
  });
});
