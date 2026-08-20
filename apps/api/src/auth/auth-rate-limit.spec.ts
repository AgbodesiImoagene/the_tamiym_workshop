import {
  authRateLimitIdentityKey,
  authRateLimitIpKey,
  normalizeAuthThrottleIdentity,
  resolveAuthThrottleIp,
} from './auth-rate-limit';

describe('auth-rate-limit helpers', () => {
  it('normalizes identity emails', () => {
    expect(normalizeAuthThrottleIdentity(' Ada@Example.COM ')).toBe(
      'ada@example.com',
    );
    expect(normalizeAuthThrottleIdentity(null)).toBe('anon');
    expect(normalizeAuthThrottleIdentity('   ')).toBe('anon');
  });

  it('resolves trusted client IPs', () => {
    expect(resolveAuthThrottleIp(' 127.0.0.1 ')).toBe('127.0.0.1');
    expect(resolveAuthThrottleIp(undefined)).toBe('unknown');
  });

  it('builds redis key shapes without raw secrets', () => {
    expect(authRateLimitIdentityKey('admin_login', 'ada@example.com')).toBe(
      'ttw:auth:rl:id:admin_login:ada@example.com',
    );
    expect(authRateLimitIpKey('admin_mfa', '10.0.0.1')).toBe(
      'ttw:auth:rl:ip:admin_mfa:10.0.0.1',
    );
  });
});
