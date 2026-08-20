import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums';

/** Stable machine-readable auth policy codes (TTW-023). */
export const ACCOUNT_POLICY_CODE = {
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
} as const;

export type AccountPolicyCode =
  (typeof ACCOUNT_POLICY_CODE)[keyof typeof ACCOUNT_POLICY_CODE];

/**
 * Business actions that require a verified email for customers.
 * Organiser application is listed for the future TTW-030 endpoint.
 */
export type VerifiedEmailAction =
  | 'CREATE_ORDER'
  | 'MUTATE_PAYOUT_PROFILE'
  | 'APPLY_AS_ORGANISER';

/**
 * Centralized verification / privileged-access policy (TTW-023 interim slice).
 *
 * Action matrix (v1):
 * - Unverified CUSTOMER may sign in and complete verification.
 * - Unverified CUSTOMER cannot create orders, mutate payout profiles, or apply as organiser.
 * - ORGANIZER and ADMIN must have verified email to authenticate (and keep a session).
 */
@Injectable()
export class AccountPolicyService {
  /**
   * Require emailVerifiedAt for a gated customer action.
   * @throws ForbiddenException with code EMAIL_NOT_VERIFIED
   */
  assertVerifiedForAction(
    user: { emailVerifiedAt: Date | null | undefined },
    action: VerifiedEmailAction,
  ): void {
    if (user.emailVerifiedAt) {
      return;
    }
    throw new ForbiddenException({
      statusCode: 403,
      code: ACCOUNT_POLICY_CODE.EMAIL_NOT_VERIFIED,
      message: this.messageForAction(action),
      action,
    });
  }

  /**
   * Privileged roles (ORGANIZER, ADMIN) must be verified to log in or refresh.
   */
  requiresVerifiedEmailForRole(role: UserRole): boolean {
    return role === UserRole.ORGANIZER || role === UserRole.ADMIN;
  }

  /**
   * Auth-boundary check: never leak verification state via a distinct status
   * from bad credentials (password-confirmation oracle).
   */
  isPrivilegedRoleUnverified(user: {
    role: UserRole;
    emailVerifiedAt: Date | null | undefined;
  }): boolean {
    return (
      this.requiresVerifiedEmailForRole(user.role) && !user.emailVerifiedAt
    );
  }

  private messageForAction(action: VerifiedEmailAction): string {
    switch (action) {
      case 'CREATE_ORDER':
        return 'Verify your email before placing an order.';
      case 'MUTATE_PAYOUT_PROFILE':
        return 'Verify your email before managing payout details.';
      case 'APPLY_AS_ORGANISER':
        return 'Verify your email before applying as an organiser.';
      default:
        return 'Verify your email to continue.';
    }
  }
}
