import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums';
import {
  ACCOUNT_POLICY_CODE,
  AccountPolicyService,
} from './account-policy.service';

describe('AccountPolicyService', () => {
  const service = new AccountPolicyService();

  describe('assertVerifiedForAction', () => {
    it('allows verified users', () => {
      expect(() =>
        service.assertVerifiedForAction(
          { emailVerifiedAt: new Date() },
          'CREATE_ORDER',
        ),
      ).not.toThrow();
    });

    it('rejects unverified users with EMAIL_NOT_VERIFIED', () => {
      try {
        service.assertVerifiedForAction(
          { emailVerifiedAt: null },
          'CREATE_ORDER',
        );
        fail('expected ForbiddenException');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const body = (err as ForbiddenException).getResponse() as Record<
          string,
          unknown
        >;
        expect(body.code).toBe(ACCOUNT_POLICY_CODE.EMAIL_NOT_VERIFIED);
        expect(body.action).toBe('CREATE_ORDER');
      }
    });
  });

  describe('assertVerifiedForPrivilegedRole', () => {
    it('allows unverified customers', () => {
      expect(() =>
        service.assertVerifiedForPrivilegedRole({
          role: UserRole.CUSTOMER,
          emailVerifiedAt: null,
        }),
      ).not.toThrow();
    });

    it('rejects unverified admins and organisers', () => {
      expect(() =>
        service.assertVerifiedForPrivilegedRole({
          role: UserRole.ADMIN,
          emailVerifiedAt: null,
        }),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.assertVerifiedForPrivilegedRole({
          role: UserRole.ORGANIZER,
          emailVerifiedAt: null,
        }),
      ).toThrow(ForbiddenException);
    });
  });
});
