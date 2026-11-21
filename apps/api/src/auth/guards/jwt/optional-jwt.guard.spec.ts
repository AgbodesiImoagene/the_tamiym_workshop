import { OptionalJwtAuthGuard } from './optional-jwt.guard';

describe('OptionalJwtAuthGuard', () => {
  const guard = new OptionalJwtAuthGuard();

  it('returns the user when the session is valid', () => {
    const user = { id: 'u1' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('turns a missing session into a visitor (null), not an error', () => {
    expect(guard.handleRequest(null, false)).toBeNull();
  });

  it('turns an invalid or expired session into a visitor, swallowing the error', () => {
    expect(guard.handleRequest(new Error('jwt expired'), false)).toBeNull();
  });
});
