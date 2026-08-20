import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReconciliationRunsService } from '../src/reconciliation/reconciliation-runs.service';
import { ReconciliationRepairService } from '../src/reconciliation/reconciliation-repair.service';
import { AdminReconciliationController } from '../src/admin/admin-reconciliation.controller';
import { AuditService } from '../src/audit/audit.service';
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

  it('marks provider run incomplete when Paystack fetch fails closed', async () => {
    const run = await runs.runProvider(new Date());
    expect(run).toBeTruthy();
    expect(run!.status).toBe(ReconciliationRunStatus.INCOMPLETE);
    expect(run!.errorSummary).toBeTruthy();
  });

  it('does not flag a SUCCEEDED payout with correct ledger net -amount', async () => {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const stamp = Date.now();
    const organizer = await prisma.user.create({
      data: {
        email: `recon-payout-org-${stamp}@example.com`,
        passwordHash,
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        firstName: 'Pay',
        lastName: 'Out',
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: 'Payout Camp',
        slug: `recon-payout-${stamp}`,
        status: CampaignStatus.ACTIVE,
        currentAmount: 0,
      },
    });
    const payout = await prisma.payout.create({
      data: {
        campaignId: campaign.id,
        recipientUserId: organizer.id,
        status: 'SUCCEEDED',
        amount: 5000,
        currency: 'NGN',
        providerRef: `trf_recon_${stamp}`,
      },
    });
    await prisma.campaignBalanceLedgerEntry.createMany({
      data: [
        {
          campaignId: campaign.id,
          payoutId: payout.id,
          entryType: LedgerEntryType.PAYOUT_RESERVED,
          amount: -5000,
          currency: 'NGN',
          availableAt: new Date(),
        },
        {
          campaignId: campaign.id,
          payoutId: payout.id,
          entryType: LedgerEntryType.PAYOUT_SUCCEEDED,
          amount: 0,
          currency: 'NGN',
          availableAt: new Date(),
        },
      ],
    });

    const run = await runs.runInternal(new Date());
    expect(run!.status).toBe(ReconciliationRunStatus.COMPLETED);

    const payoutFindings = await prisma.reconciliationFinding.findMany({
      where: {
        domain: 'PAYOUT',
        status: ReconciliationFindingStatus.OPEN,
      },
    });
    const hit = payoutFindings.find((f) => {
      const ids = f.sourceIds as { payoutId?: string } | null;
      return ids?.payoutId === payout.id;
    });
    expect(hit).toBeUndefined();
  });

  it('masks findings and pages with nextCursor', async () => {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const stamp = Date.now();
    const admin = await prisma.user.create({
      data: {
        email: `recon-mask-${stamp}@example.com`,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        firstName: 'Mask',
        lastName: 'Admin',
      },
    });
    const organizer = await prisma.user.create({
      data: {
        email: `recon-mask-org-${stamp}@example.com`,
        passwordHash,
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        firstName: 'Org',
        lastName: 'Mask',
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: 'Mask Camp',
        slug: `recon-mask-${stamp}`,
        status: CampaignStatus.ACTIVE,
        currentAmount: 99,
      },
    });
    await prisma.campaignBalanceLedgerEntry.create({
      data: {
        campaignId: campaign.id,
        entryType: LedgerEntryType.PAYMENT_SETTLED,
        amount: 1,
        currency: 'NGN',
        availableAt: new Date(),
      },
    });
    await runs.runInternal(new Date());
    const findings = await prisma.reconciliationFinding.findMany({
      where: { domain: 'CAMPAIGN', status: ReconciliationFindingStatus.OPEN },
    });
    const finding = findings.find((f) => {
      const ids = f.sourceIds as { campaignId?: string } | null;
      return ids?.campaignId === campaign.id;
    });
    expect(finding).toBeTruthy();
    await prisma.reconciliationFinding.update({
      where: { id: finding!.id },
      data: {
        evidence: {
          rawSecret: 'sk_live_should_not_leak',
          email: 'customer@example.com',
        },
      },
    });

    const controller = new AdminReconciliationController(
      prisma,
      runs,
      repairs,
      app.get(AuditService),
    );
    const listed = await controller.listFindings(
      ReconciliationFindingStatus.OPEN,
      undefined,
      undefined,
      undefined,
      '50',
    );
    expect(listed.items.length).toBeGreaterThan(0);
    expect(listed).toHaveProperty('nextCursor');
    const masked = listed.items.find(
      (i: { id: string }) => i.id === finding!.id,
    );
    expect(masked).toBeTruthy();
    expect(masked).not.toHaveProperty('evidence');
    expect(JSON.stringify(masked)).not.toContain('sk_live_should_not_leak');
    expect(JSON.stringify(masked)).not.toContain('customer@example.com');
    void admin;
  });

  it('documents inventory drift with two-person WONT_FIX repair', async () => {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const stamp = Date.now();
    const requester = await prisma.user.create({
      data: {
        email: `recon-inv-req-${stamp}@example.com`,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        firstName: 'Req',
        lastName: 'Inv',
      },
    });
    const approver = await prisma.user.create({
      data: {
        email: `recon-inv-apr-${stamp}@example.com`,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        firstName: 'Apr',
        lastName: 'Inv',
      },
    });
    const run = await runs.runInternal(new Date());
    const finding = await prisma.reconciliationFinding.create({
      data: {
        runId: run!.id,
        domain: 'INVENTORY',
        outcome: 'MISMATCH',
        severity: 'CRITICAL',
        fingerprint: `inv-doc-${stamp}`,
        leftLabel: 'inventory.reserved',
        leftValue: '1',
        rightLabel: 'sum(movement.reservedDelta)',
        rightValue: '0',
        sourceIds: { variantId: `var-${stamp}` },
      },
    });

    const request = await repairs.requestRepair({
      findingId: finding.id,
      actorUserId: requester.id,
      commandKey: 'inventory.noop_document_drift',
    });
    await repairs.approveAndApply({
      repairId: request.id,
      actorUserId: approver.id,
    });

    const updated = await prisma.reconciliationFinding.findUniqueOrThrow({
      where: { id: finding.id },
    });
    expect(updated.status).toBe(ReconciliationFindingStatus.WONT_FIX);
  });
});
