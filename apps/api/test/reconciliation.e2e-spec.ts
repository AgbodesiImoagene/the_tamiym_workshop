import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReconciliationRunsService } from '../src/reconciliation/reconciliation-runs.service';
import { ReconciliationRepairService } from '../src/reconciliation/reconciliation-repair.service';
import {
  CampaignStatus,
  LedgerEntryType,
  ReconciliationFindingStatus,
  ReconciliationRunStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

describe('Reconciliation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let runs: ReconciliationRunsService;
  let repairs: ReconciliationRepairService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    runs = app.get(ReconciliationRunsService);
    repairs = app.get(ReconciliationRepairService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  it('detects campaign currentAmount mismatch and repairs with two admins', async () => {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const stamp = Date.now();
    const organizer = await prisma.user.create({
      data: {
        email: `recon-org-${stamp}@example.com`,
        passwordHash,
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        firstName: 'Org',
        lastName: 'Recon',
      },
    });
    const requester = await prisma.user.create({
      data: {
        email: `recon-req-${stamp}@example.com`,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        firstName: 'Req',
        lastName: 'Admin',
      },
    });
    const approver = await prisma.user.create({
      data: {
        email: `recon-apr-${stamp}@example.com`,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        firstName: 'Apr',
        lastName: 'Admin',
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: 'Recon Camp',
        slug: `recon-${stamp}`,
        status: CampaignStatus.ACTIVE,
        currentAmount: 100,
      },
    });
    await prisma.campaignBalanceLedgerEntry.create({
      data: {
        campaignId: campaign.id,
        entryType: LedgerEntryType.PAYMENT_SETTLED,
        amount: 50,
        currency: 'NGN',
        availableAt: new Date(),
      },
    });

    const run = await runs.runInternal(new Date());
    expect(run).toBeTruthy();
    expect(run!.status).toBe(ReconciliationRunStatus.COMPLETED);

    const findings = await prisma.reconciliationFinding.findMany({
      where: {
        domain: 'CAMPAIGN',
        status: ReconciliationFindingStatus.OPEN,
      },
    });
    const finding = findings.find((f) => {
      const ids = f.sourceIds as { campaignId?: string } | null;
      return ids?.campaignId === campaign.id;
    });
    expect(finding).toBeTruthy();

    const request = await repairs.requestRepair({
      findingId: finding!.id,
      actorUserId: requester.id,
      commandKey: 'campaign.recompute_current_amount',
    });

    await expect(
      repairs.approveAndApply({
        repairId: request.id,
        actorUserId: requester.id,
      }),
    ).rejects.toThrow(/second distinct admin/i);

    await repairs.approveAndApply({
      repairId: request.id,
      actorUserId: approver.id,
    });

    const updated = await prisma.campaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });
    expect(Number(updated.currentAmount)).toBe(50);

    const resolved = await prisma.reconciliationFinding.findUniqueOrThrow({
      where: { id: finding!.id },
    });
    expect(resolved.status).toBe(ReconciliationFindingStatus.RESOLVED);

    const auditEvents = await prisma.auditLog.findMany({
      where: {
        entityType: 'ReconciliationRepairRequest',
        entityId: request.id,
      },
    });
    expect(auditEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('marks provider run incomplete when pagination fails closed', async () => {
    const run = await runs.runProvider(new Date(), { forceIncomplete: true });
    expect(run).toBeTruthy();
    expect(run!.status).toBe(ReconciliationRunStatus.INCOMPLETE);
  });
});
