import { redactPublicDesignShareUrl } from './design-share.redact';

describe('redactPublicDesignShareUrl', () => {
  it('redacts bearers on the public designs path', () => {
    expect(
      redactPublicDesignShareUrl('/v1/public/designs/supersecrettokenvalue'),
    ).toBe('/v1/public/designs/[REDACTED]');
  });

  it('preserves query strings after redaction', () => {
    expect(redactPublicDesignShareUrl('/v1/public/designs/tok123?x=1')).toBe(
      '/v1/public/designs/[REDACTED]?x=1',
    );
  });

  it('leaves unrelated URLs alone', () => {
    expect(redactPublicDesignShareUrl('/v1/designs/abc')).toBe(
      '/v1/designs/abc',
    );
  });
});
