import { BadRequestException } from '@nestjs/common';
import {
  PayoutProfileStatus,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { ORGANIZER_TERMS_VERSION } from '../organizer/organizer.constants';
import {
  evaluatePayoutEligibility,
  PayoutEligibilityCode,
  PayoutEligibilityGate,
} from './payout-eligibility';
import {
  assertAutoExecuteModeAllowed,
  assertPayoutEligible,
  loadPayoutEligibilityOrganiser,
  toEligibilityProfile,
} from './payout-eligibility.helpers';

describe('payout-eligibility.helpers', () => {
  it('assertPayoutEligible passes and throws with stable codes', () => {
    const ok = evaluatePayoutEligibility({
      gate: PayoutEligibilityGate.RUN_CREATE,
      organiser: {
        id: 'o1',
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        phone: '080',
        termsVersion: ORGANIZER_TERMS_VERSION,
      },
      profile: toEligibilityProfile({
        id: 'p1',
        userId: 'o1',
        status: PayoutProfileStatus.VERIFIED,
        bankResolutionStatus: 'STUB_MATCH',
        destinationVersion: 1,
      }),
    });
    expect(() => assertPayoutEligible(ok)).not.toThrow();

    const bad = evaluatePayoutEligibility({
      gate: PayoutEligibilityGate.RUN_CREATE,
      organiser: {
        id: 'o1',
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        phone: '080',
        termsVersion: ORGANIZER_TERMS_VERSION,
      },
      profile: null,
    });
    try {
      assertPayoutEligible(bad);
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as {
        code: string;
      };
      expect(body.code).toBe(PayoutEligibilityCode.PROFILE_MISSING);
    }
  });

  it('assertAutoExecuteModeAllowed gates AUTO_EXECUTE', () => {
    expect(() => assertAutoExecuteModeAllowed('MANUAL', false)).not.toThrow();
    expect(() =>
      assertAutoExecuteModeAllowed('AUTO_EXECUTE', true),
    ).not.toThrow();
    expect(() => assertAutoExecuteModeAllowed('AUTO_EXECUTE', false)).toThrow(
      BadRequestException,
    );
  });

  it('loadPayoutEligibilityOrganiser returns null when missing', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      userPayoutProfile: {},
    };
    await expect(
      loadPayoutEligibilityOrganiser(prisma as never, 'missing'),
    ).resolves.toBeNull();
  });

  it('loadPayoutEligibilityOrganiser maps fields', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          role: UserRole.ORGANIZER,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          phone: '080',
          organizerApplications: [{ termsVersion: 't1' }],
        }),
      },
      userPayoutProfile: {},
    };
    await expect(
      loadPayoutEligibilityOrganiser(prisma as never, 'o1'),
    ).resolves.toMatchObject({ id: 'o1', termsVersion: 't1', phone: '080' });
  });
});
