import { UserRole, UserStatus } from '../generated/prisma/enums';
import { ORGANIZER_TERMS_VERSION } from './organizer.constants';

export type EligibilityUser = {
  id: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  firstName: string;
  lastName: string;
  phone: string | null;
};

export type EligibilityGap =
  | 'NOT_CUSTOMER'
  | 'NOT_ACTIVE'
  | 'EMAIL_UNVERIFIED'
  | 'MISSING_FIRST_NAME'
  | 'MISSING_LAST_NAME'
  | 'MISSING_PHONE'
  | 'ALREADY_ORGANIZER';

export type EligibilityResult = {
  eligible: boolean;
  gaps: EligibilityGap[];
  termsVersion: string;
  actionableGuidance: string[];
};

const GUIDANCE: Record<EligibilityGap, string> = {
  NOT_CUSTOMER: 'Organiser applications are available to customer accounts.',
  NOT_ACTIVE: 'Your account must be active before you can apply.',
  EMAIL_UNVERIFIED: 'Verify your email address, then return here to apply.',
  MISSING_FIRST_NAME: 'Add your first name in profile settings.',
  MISSING_LAST_NAME: 'Add your last name in profile settings.',
  MISSING_PHONE: 'Add a phone number in profile settings.',
  ALREADY_ORGANIZER: 'Your account already has organiser access.',
};

export function evaluateOrganizerEligibility(
  user: EligibilityUser,
): EligibilityResult {
  const gaps: EligibilityGap[] = [];

  if (user.role === UserRole.ORGANIZER) {
    gaps.push('ALREADY_ORGANIZER');
  } else if (user.role !== UserRole.CUSTOMER) {
    gaps.push('NOT_CUSTOMER');
  }

  if (user.status !== UserStatus.ACTIVE) {
    gaps.push('NOT_ACTIVE');
  }
  if (!user.emailVerifiedAt) {
    gaps.push('EMAIL_UNVERIFIED');
  }
  if (!user.firstName?.trim()) {
    gaps.push('MISSING_FIRST_NAME');
  }
  if (!user.lastName?.trim()) {
    gaps.push('MISSING_LAST_NAME');
  }
  if (!user.phone?.trim()) {
    gaps.push('MISSING_PHONE');
  }

  const blocking = gaps.filter((g) => g !== 'ALREADY_ORGANIZER');
  const eligible =
    user.role === UserRole.CUSTOMER &&
    user.status === UserStatus.ACTIVE &&
    blocking.length === 0;

  return {
    eligible,
    gaps,
    termsVersion: ORGANIZER_TERMS_VERSION,
    actionableGuidance: gaps.map((g) => GUIDANCE[g]),
  };
}
