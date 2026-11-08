import { createHash } from 'node:crypto';
import { hashAuthToken, mintAuthToken } from './auth-token.crypto';

/** TTW-083: reset and verification tokens are stored as SHA-256 digests. */
describe('auth-token.crypto', () => {
  it('mints distinct 32-byte hex tokens', () => {
    const a = mintAuthToken();
    const b = mintAuthToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('hashes to the SHA-256 hex digest, never the token itself', () => {
    const token = mintAuthToken();
    const digest = hashAuthToken(token);
    expect(digest).toBe(
      createHash('sha256').update(token, 'utf8').digest('hex'),
    );
    expect(digest).not.toBe(token);
    expect(hashAuthToken(token)).toBe(digest);
  });
});
