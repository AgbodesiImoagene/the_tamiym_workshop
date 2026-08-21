import { UserRole, UserStatus } from '../generated/prisma/enums';
import { ORGANIZER_TERMS_VERSION } from './organizer.constants';
import { evaluateOrganizerEligibility } from './organizer-eligibility';

describe('evaluateOrganizerEligibility', () => {
  const base = {
    id: 'u1',
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '+2348012345678',
  };

  it('marks a complete active customer eligible', () => {
    const result = evaluateOrganizerEligibility(base);
    expect(result.eligible).toBe(true);
    expect(result.gaps).toEqual([]);
    expect(result.termsVersion).toBe(ORGANIZER_TERMS_VERSION);
  });

  it('requires verified email, names, and phone', () => {
    const result = evaluateOrganizerEligibility({
      ...base,
      emailVerifiedAt: null,
      firstName: ' ',
      lastName: '',
      phone: null,
    });
    expect(result.eligible).toBe(false);
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        'EMAIL_UNVERIFIED',
        'MISSING_FIRST_NAME',
        'MISSING_LAST_NAME',
        'MISSING_PHONE',
      ]),
    );
    expect(result.actionableGuidance.length).toBe(result.gaps.length);
  });

  it('rejects non-customer and inactive accounts', () => {
    expect(
      evaluateOrganizerEligibility({ ...base, role: UserRole.ADMIN }).eligible,
    ).toBe(false);
    expect(
      evaluateOrganizerEligibility({
        ...base,
        status: UserStatus.SUSPENDED,
      }).gaps,
    ).toContain('NOT_ACTIVE');
  });

  it('flags existing organizers', () => {
    const result = evaluateOrganizerEligibility({
      ...base,
      role: UserRole.ORGANIZER,
    });
    expect(result.eligible).toBe(false);
    expect(result.gaps).toContain('ALREADY_ORGANIZER');
  });
});
