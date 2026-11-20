import { ModerationStatus } from '../generated/prisma/enums';
import { isShareLinkOpen, isShareTokenShape } from './design-share.policy';

const open = () => ({
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
  design: { moderationStatus: ModerationStatus.APPROVED },
});

describe('isShareLinkOpen', () => {
  it('is open for a live link on an approved design', () => {
    expect(isShareLinkOpen(open())).toBe(true);
  });

  it.each([
    ['missing', null],
    ['revoked', { ...open(), revokedAt: new Date() }],
    ['expired', { ...open(), expiresAt: new Date(Date.now() - 1) }],
    [
      'on a design that is not approved',
      { ...open(), design: { moderationStatus: ModerationStatus.PENDING } },
    ],
  ])('is closed when the link is %s', (_label, link) => {
    expect(isShareLinkOpen(link)).toBe(false);
  });

  it('is closed exactly at the expiry instant', () => {
    const expiresAt = new Date(1_000);
    expect(isShareLinkOpen({ ...open(), expiresAt }, 1_000)).toBe(false);
    expect(isShareLinkOpen({ ...open(), expiresAt }, 999)).toBe(true);
  });
});

describe('isShareTokenShape', () => {
  it.each([
    ['a'.repeat(16), true],
    ['a'.repeat(128), true],
    ['a'.repeat(15), false],
    ['a'.repeat(129), false],
    ['', false],
    [undefined, false],
  ])('%p -> %p', (token, expected) => {
    expect(isShareTokenShape(token)).toBe(expected);
  });
});
