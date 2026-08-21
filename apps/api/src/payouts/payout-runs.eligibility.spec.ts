import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  PayoutMode,
  PayoutProfileStatus,
  PayoutRunStatus,
  PayoutStatus,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { ORGANIZER_TERMS_VERSION } from '../organizer/organizer.constants';
import { AuditService } from '../audit/audit.service';
import { ObservabilityService } from '../observability/observability.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignLedgerService } from './campaign-ledger.service';
import { PayoutRunsService } from './payout-runs.service';
import { PayoutsService } from './payouts.service';

const verifiedProfile = {
  id: 'prof-1',
  userId: 'org-1',
  status: PayoutProfileStatus.VERIFIED,
  bankResolutionStatus: 'STUB_MATCH',
  destinationVersion: 1,
  bankCode: '058',
  accountName: 'Org One',
  accountNumber: '0123456789',
  recipientCode: 'RCP_1',
};

const eligibleOrganizer = {
  id: 'org-1',
  role: UserRole.ORGANIZER,
  status: UserStatus.ACTIVE,
  emailVerifiedAt: new Date('2026-01-01'),
  phone: '+2348012345678',
  organizerApplications: [{ termsVersion: ORGANIZER_TERMS_VERSION }],
  payoutProfiles: [verifiedProfile],
};

describe('PayoutRunsService eligibility gates', () => {
  async function build(
    prisma: Record<string, unknown>,
    options?: { configGet?: unknown; resolveRecipient?: jest.Mock },
  ) {
    const configGet = options?.configGet;
    const resolveRecipient =
      options?.resolveRecipient ?? jest.fn().mockResolvedValue('RCP_1');
    const module = await Test.createTestingModule({
      providers: [
        PayoutRunsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CampaignLedgerService,
          useValue: {
            getEligibleBalancesByCampaign: jest
              .fn()
              .mockResolvedValue(new Map([['camp-1', 5000]])),
            createPayoutReserved: jest.fn(),
            createPayoutFailed: jest.fn(),
          },
        },
        {
          provide: PayoutsService,
          useValue: {
            initiateTransfer: jest
              .fn()
              .mockResolvedValue({ reference: 'tr_1' }),
            resolveRecipient,
          },
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
        {
          provide: ObservabilityService,
          useValue: {
            recordPayoutRun: jest.fn(),
            startSpan: jest.fn(
              async (_n: string, _a: unknown, fn: () => Promise<unknown>) =>
                fn(),
            ),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: () => configGet },
        },
      ],
    }).compile();
    return module.get(PayoutRunsService);
  }

  it('preview includes only policy-eligible campaigns', async () => {
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue({ minimumPayoutAmount: 1000 }),
      },
      campaign: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'camp-1',
            title: 'Drive',
            organizerId: 'org-1',
            currency: 'NGN',
            organizer: eligibleOrganizer,
            payoutProfile: null,
          },
          {
            id: 'camp-2',
            title: 'Bad',
            organizerId: 'org-2',
            currency: 'NGN',
            organizer: {
              ...eligibleOrganizer,
              id: 'org-2',
              phone: null,
              payoutProfiles: [],
            },
            payoutProfile: null,
          },
        ]),
      },
    };
    const ledger = {
      getEligibleBalancesByCampaign: jest.fn().mockResolvedValue(
        new Map([
          ['camp-1', 5000],
          ['camp-2', 5000],
        ]),
      ),
    };
    const module = await Test.createTestingModule({
      providers: [
        PayoutRunsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CampaignLedgerService, useValue: ledger },
        {
          provide: PayoutsService,
          useValue: {
            initiateTransfer: jest.fn(),
            resolveRecipient: jest.fn(),
          },
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
        {
          provide: ObservabilityService,
          useValue: { recordPayoutRun: jest.fn(), startSpan: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    const service = module.get(PayoutRunsService);
    const preview = await service.previewPayoutRun(new Date());
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]?.campaignId).toBe('camp-1');
    expect(preview.policyVersion).toContain('payout-eligibility');
  });

  it('createPayoutRun snapshots policy and destination', async () => {
    const payoutCreate = jest.fn().mockResolvedValue({ id: 'pay-1' });
    const prisma: Record<string, unknown> = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue({ minimumPayoutAmount: 0 }),
      },
      campaign: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'camp-1',
            title: 'Drive',
            organizerId: 'org-1',
            currency: 'NGN',
            organizer: eligibleOrganizer,
            payoutProfile: verifiedProfile,
          },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'camp-1',
          organizer: eligibleOrganizer,
          payoutProfile: verifiedProfile,
        }),
      },
      payout: {
        create: payoutCreate,
        count: jest.fn().mockResolvedValue(1),
      },
      payoutRun: {
        create: jest.fn().mockResolvedValue({
          id: 'run-1',
          status: PayoutRunStatus.DRAFT,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          payoutRun: {
            create: jest.fn().mockResolvedValue({
              id: 'run-1',
              status: PayoutRunStatus.DRAFT,
            }),
          },
          campaign: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'camp-1',
              organizer: eligibleOrganizer,
              payoutProfile: verifiedProfile,
            }),
          },
          payout: { create: payoutCreate },
        }),
      ),
    };
    const service = await build(prisma);
    const result = await service.createPayoutRun(
      new Date(),
      new Date(),
      PayoutMode.MANUAL,
      'admin-1',
    );
    expect(result.payoutCount).toBe(1);
    expect(payoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshotProfileId: 'prof-1',
          snapshotDestinationVersion: 1,
          snapshotAccountMask: '***6789',
          snapshotRecipientCode: 'RCP_1',
          policyVersion: expect.stringContaining('payout-eligibility'),
        }),
      }),
    );
  });

  it('approvePayoutRun rechecks eligibility', async () => {
    const prisma = {
      payoutRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'run-1',
          status: PayoutRunStatus.DRAFT,
          mode: PayoutMode.MANUAL,
          payouts: [
            {
              id: 'pay-1',
              recipientUserId: 'org-1',
              snapshotProfileId: 'prof-1',
            },
          ],
        }),
        update: jest.fn(),
      },
      payout: { updateMany: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'org-1',
          role: UserRole.ORGANIZER,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          phone: '080',
          organizerApplications: [{ termsVersion: ORGANIZER_TERMS_VERSION }],
        }),
      },
      userPayoutProfile: {
        findUnique: jest.fn().mockResolvedValue(verifiedProfile),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          payoutRun: { update: jest.fn() },
          payout: { updateMany: jest.fn() },
        }),
      ),
    };
    const service = await build(prisma);
    await expect(service.approvePayoutRun('run-1', 'admin-1')).resolves.toEqual(
      { id: 'run-1', status: PayoutRunStatus.APPROVED },
    );
  });

  it('executeSinglePayout uses snapshot and blocks suspended profiles', async () => {
    const prisma = {
      payout: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pay-1',
          status: PayoutStatus.QUEUED,
          campaignId: 'camp-1',
          recipientUserId: 'org-1',
          amount: 1000,
          currency: 'NGN',
          snapshotBankCode: '058',
          snapshotAccountName: 'Org One',
          snapshotRecipientCode: 'RCP_1',
          snapshotProfileId: 'prof-1',
          idempotencyKey: null,
        }),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'org-1',
          role: UserRole.ORGANIZER,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          phone: '080',
          organizerApplications: [{ termsVersion: ORGANIZER_TERMS_VERSION }],
        }),
      },
      userPayoutProfile: {
        findUnique: jest.fn().mockResolvedValue({
          ...verifiedProfile,
          status: PayoutProfileStatus.SUSPENDED,
        }),
      },
    };
    const service = await build(prisma);
    await expect(service.executeSinglePayout('pay-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('executeSinglePayout initiates transfer from snapshot recipient', async () => {
    const payoutUpdate = jest.fn();
    const resolveRecipient = jest.fn();
    const prisma = {
      payout: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pay-1',
          status: PayoutStatus.QUEUED,
          campaignId: 'camp-1',
          recipientUserId: 'org-1',
          amount: 1000,
          currency: 'NGN',
          snapshotBankCode: '058',
          snapshotAccountName: 'Org One',
          snapshotRecipientCode: 'RCP_1',
          snapshotProfileId: 'prof-1',
          idempotencyKey: null,
        }),
        update: payoutUpdate,
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'org-1',
          role: UserRole.ORGANIZER,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          phone: '080',
          organizerApplications: [{ termsVersion: ORGANIZER_TERMS_VERSION }],
        }),
      },
      userPayoutProfile: {
        findUnique: jest.fn().mockResolvedValue(verifiedProfile),
      },
    };
    const service = await build(prisma, { resolveRecipient });
    await service.executeSinglePayout('pay-1');
    expect(resolveRecipient).not.toHaveBeenCalled();
    expect(payoutUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PayoutStatus.INITIATED }),
      }),
    );
  });

  it('executeSinglePayout refuses when snapshot recipient is missing', async () => {
    const resolveRecipient = jest.fn().mockResolvedValue('RCP_LIVE');
    const prisma = {
      payout: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pay-1',
          status: PayoutStatus.QUEUED,
          campaignId: 'camp-1',
          recipientUserId: 'org-1',
          amount: 1000,
          currency: 'NGN',
          snapshotBankCode: '058',
          snapshotAccountName: 'Org One',
          snapshotRecipientCode: null,
          snapshotProfileId: 'prof-1',
          idempotencyKey: null,
        }),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'org-1',
          role: UserRole.ORGANIZER,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          phone: '080',
          organizerApplications: [{ termsVersion: ORGANIZER_TERMS_VERSION }],
        }),
      },
      userPayoutProfile: {
        findUnique: jest.fn().mockResolvedValue(verifiedProfile),
      },
    };
    const service = await build(prisma, { resolveRecipient });
    await expect(service.executeSinglePayout('pay-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(resolveRecipient).not.toHaveBeenCalled();
  });
});
