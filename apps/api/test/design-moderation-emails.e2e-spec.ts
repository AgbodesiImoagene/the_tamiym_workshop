import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DesignsService } from '../src/designs/designs.service';
import { ModerationDecisionService } from '../src/moderation/moderation-decision.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  ModerationActorKind,
  ModerationStatus,
  ModerationSubjectType,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

const NOTE = 'INTERNAL-NOTE: copied logo, hate score 0.91';

describe('Design moderation emails (TTW-109, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let designs: DesignsService;
  let decisions: ModerationDecisionService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    designs = app.get(DesignsService);
    decisions = app.get(ModerationDecisionService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createDesign() {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const owner = await prisma.user.create({
      data: {
        email: `design-mail-${stamp}@example.com`,
        passwordHash: 'x',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Ada',
        lastName: 'Owner',
      },
    });
    const category = await prisma.category.create({
      data: { name: `DM Cat ${stamp}`, slug: `dm-cat-${stamp}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `DM Product ${stamp}`,
        slug: `dm-product-${stamp}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
      },
    });
    const design = await prisma.design.create({
      data: {
        userId: owner.id,
        productId: product.id,
        name: 'Team shirt',
        designData: { version: 1, views: {} },
        moderationStatus: ModerationStatus.PENDING,
      },
    });
    return { owner, product, design };
  }

  const emailsFor = (designId: string) =>
    prisma.notificationOutbox.findMany({
      where: {
        eventName: {
          in: ['DesignModerationApproved', 'DesignModerationRejected'],
        },
        payload: { path: ['designId'], equals: designId },
      },
    });

  it('approving a design queues exactly one email without the notes', async () => {
    const { owner, design } = await createDesign();
    await designs.updateModeration(
      design.id,
      ModerationStatus.APPROVED,
      NOTE,
      undefined,
    );
    const rows = await emailsFor(design.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      eventName: 'DesignModerationApproved',
      recipient: owner.email,
      recipientUserId: owner.id,
    });
    expect(JSON.stringify(rows[0].payload)).not.toContain('INTERNAL-NOTE');
    expect(rows[0].payload).toMatchObject({
      designName: 'Team shirt',
      firstName: 'Ada',
    });
  });

  it('rejecting a design queues one rejection email', async () => {
    const { design } = await createDesign();
    await designs.updateModeration(
      design.id,
      ModerationStatus.REJECTED,
      NOTE,
      undefined,
    );
    const rows = await emailsFor(design.id);
    expect(rows.map((r) => r.eventName)).toEqual(['DesignModerationRejected']);
    expect(JSON.stringify(rows[0])).not.toContain('INTERNAL-NOTE');
  });

  it('a replayed decision, sequential or concurrent, sends no second email', async () => {
    const { design } = await createDesign();
    await designs.updateModeration(design.id, ModerationStatus.APPROVED, 'a');
    await designs.updateModeration(design.id, ModerationStatus.APPROVED, 'b');
    expect(await emailsFor(design.id)).toHaveLength(1);

    const second = await createDesign();
    await Promise.all([
      designs.updateModeration(second.design.id, ModerationStatus.REJECTED),
      designs.updateModeration(second.design.id, ModerationStatus.REJECTED),
    ]);
    expect(await emailsFor(second.design.id)).toHaveLength(1);
  });

  it('flagging, and automatic decisions, send nothing', async () => {
    const { design } = await createDesign();
    await designs.updateModeration(design.id, ModerationStatus.FLAGGED, NOTE);
    await decisions.recordAiDecision({
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: design.id,
      outcome: ModerationStatus.REJECTED,
      notes: 'score',
    });
    expect(await emailsFor(design.id)).toHaveLength(0);
  });

  it('resolving an appeal queues one email, and only once', async () => {
    const { owner, design } = await createDesign();
    const rejected = await decisions.recordAdminDecision({
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: design.id,
      outcome: ModerationStatus.REJECTED,
      actorUserId: 'admin-a',
      notes: NOTE,
    });
    const appeal = await decisions.createAppeal(
      owner.id,
      rejected.id,
      'This is my own artwork.',
    );
    expect(await emailsFor(design.id)).toHaveLength(1);

    await decisions.resolveAppeal('admin-b', appeal.id, {
      resolution: 'OVERTURNED',
      notes: NOTE,
    });
    await expect(
      decisions.resolveAppeal('admin-b', appeal.id, {
        resolution: 'OVERTURNED',
      }),
    ).rejects.toThrow();

    const rows = await emailsFor(design.id);
    expect(rows.map((r) => r.eventName).sort()).toEqual([
      'DesignModerationApproved',
      'DesignModerationRejected',
    ]);
    expect(JSON.stringify(rows)).not.toContain('INTERNAL-NOTE');
    expect(ModerationActorKind.APPEAL_RESOLUTION).toBeDefined();
  });
});
