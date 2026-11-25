import { UserThrottlerGuard } from './user-throttler.guard';

describe('UserThrottlerGuard (TTW-263)', () => {
  const tracker = (req: Record<string, unknown>) =>
    (
      UserThrottlerGuard.prototype as unknown as {
        getTracker(r: Record<string, unknown>): Promise<string>;
      }
    ).getTracker(req);

  it('counts per signed-in user, whatever the address', async () => {
    await expect(tracker({ user: { id: 'u1' }, ip: '10.0.0.1' })).resolves.toBe(
      'user:u1',
    );
    await expect(tracker({ user: { id: 'u1' }, ip: '10.0.0.2' })).resolves.toBe(
      'user:u1',
    );
    await expect(tracker({ user: { id: 'u2' }, ip: '10.0.0.1' })).resolves.toBe(
      'user:u2',
    );
  });

  it('falls back to the address when nobody is signed in', async () => {
    await expect(tracker({ ip: '10.0.0.1' })).resolves.toBe('10.0.0.1');
  });
});
