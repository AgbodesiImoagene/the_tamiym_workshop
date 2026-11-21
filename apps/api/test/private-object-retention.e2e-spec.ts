import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { App } from 'supertest/types';
import { PrivateObjectRetentionService } from '../src/media/private-object-retention.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3Service } from '../src/storage/s3.service';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaSourceType,
  MediaVisibility,
  ModerationActorKind,
  ModerationAppealStatus,
  ModerationStatus,
  ModerationSubjectType,
  UserRole,
  UserStatus,
  VirusScanStatus,
} from '../src/generated/prisma/enums';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

const DAY = 24 * 60 * 60 * 1000;

class InMemoryS3 {
  readonly objects = new Set<string>();
  failFor: string | null = null;
  deleted: string[] = [];

  deletePrivateObject = (key: string) => {
    if (this.failFor && key.includes(this.failFor)) {
      return Promise.reject(new Error('storage down'));
    }
    this.objects.delete(key);
    this.deleted.push(key);
    return Promise.resolve();
  };
}

describe('Retention of private objects (e2e, TTW-235)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let retention: PrivateObjectRetentionService;
  let ownerId: string;
  const s3 = new InMemoryS3();

  beforeAll(async () => {
    app = await createE2eApp({
      configure: (b) => b.overrideProvider(S3Service).useValue(s3),
    });
    prisma = app.get(PrismaService);
    retention = app.get(PrivateObjectRetentionService, { strict: false });
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const owner = await prisma.user.create({
      data: {
        email: `retention-${stamp}@example.com`,
        passwordHash: await bcrypt.hash('TestPassword1!', 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Retention',
        lastName: 'Owner',
        phone: '+2348011111111',
        emailVerifiedAt: new Date(),
      },
    });
    ownerId = owner.id;
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  beforeEach(() => {
    s3.failFor = null;
    s3.deleted = [];
  });

  async function makeAsset(opts: {
    ageDays: number;
    status?: MediaAssetStatus;
    moderationStatus?: ModerationStatus;
    visibility?: MediaVisibility;
    attached?: boolean;
  }) {
    const at = new Date(Date.now() - opts.ageDays * DAY);
    const asset = await prisma.mediaAsset.create({
      data: {
        sourceType: MediaSourceType.UPLOAD,
        visibility: opts.visibility ?? MediaVisibility.PRIVATE,
        status: opts.status ?? MediaAssetStatus.READY,
        scanStatus: VirusScanStatus.CLEAN,
        moderationStatus: opts.moderationStatus ?? ModerationStatus.APPROVED,
        createdAt: at,
        updatedAt: at,
      },
    });
    const keys = {
      original: `media/${asset.id}/original.png`,
      display: `media/${asset.id}/display.webp`,
    };
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { originalKey: keys.original, updatedAt: at },
    });
    await prisma.mediaDerivative.create({
      data: {
        assetId: asset.id,
        type: MediaDerivativeType.DISPLAY,
        key: keys.display,
        mimeType: 'image/webp',
        sizeBytes: 10,
      },
    });
    s3.objects.add(keys.original);
    s3.objects.add(keys.display);
    if (opts.attached !== false) {
      await prisma.designAsset.create({
        data: { ownerUserId: ownerId, mediaAssetId: asset.id },
      });
    }
    return { id: asset.id, keys };
  }

  async function decide(
    assetId: string,
    outcome: ModerationStatus,
    ageDays: number,
  ) {
    return prisma.moderationDecision.create({
      data: {
        subjectType: ModerationSubjectType.MEDIA,
        subjectId: assetId,
        outcome,
        actorKind: ModerationActorKind.AI,
        policyVersion: 'test',
        reasonCodes: [],
        createdAt: new Date(Date.now() - ageDays * DAY),
      },
    });
  }

  async function appeal(
    decisionId: string,
    status: ModerationAppealStatus,
  ): Promise<void> {
    await prisma.moderationAppeal.create({
      data: {
        decisionId,
        ownerUserId: ownerId,
        status,
        statement: 'Please review',
        policyVersion: 'test',
      },
    });
  }

  async function rejected(ageDays: number) {
    const asset = await makeAsset({
      ageDays: ageDays + 1,
      status: MediaAssetStatus.FAILED,
      moderationStatus: ModerationStatus.REJECTED,
    });
    const decision = await decide(asset.id, ModerationStatus.REJECTED, ageDays);
    return { ...asset, decision };
  }

  async function isPurged(id: string) {
    const row = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id },
      include: { derivatives: true },
    });
    return row.originalKey === null && row.derivatives.length === 0;
  }

  it('deletes a file rejected without appeal 14 days after the decision, not before', async () => {
    const old = await rejected(15);
    const recent = await rejected(13);
    await retention.runOnce(new Date());
    expect(await isPurged(old.id)).toBe(true);
    expect(s3.objects.has(old.keys.original)).toBe(false);
    expect(s3.objects.has(old.keys.display)).toBe(false);
    expect(await isPurged(recent.id)).toBe(false);
    expect(s3.objects.has(recent.keys.original)).toBe(true);
  });

  it('keeps a rejected file while an appeal is pending, however old the decision', async () => {
    const a = await rejected(40);
    await appeal(a.decision.id, ModerationAppealStatus.PENDING);
    await retention.runOnce(new Date());
    expect(await isPurged(a.id)).toBe(false);
  });

  it('counts the 14 days from the answer once an appeal is upheld', async () => {
    const answeredRecently = await rejected(40);
    await appeal(answeredRecently.decision.id, ModerationAppealStatus.UPHELD);
    await decide(answeredRecently.id, ModerationStatus.REJECTED, 3);

    const answeredLongAgo = await rejected(60);
    await appeal(answeredLongAgo.decision.id, ModerationAppealStatus.UPHELD);
    await decide(answeredLongAgo.id, ModerationStatus.REJECTED, 15);

    await retention.runOnce(new Date());
    expect(await isPurged(answeredRecently.id)).toBe(false);
    expect(await isPurged(answeredLongAgo.id)).toBe(true);
  });

  it('keeps a file whose rejection was overturned', async () => {
    const a = await rejected(40);
    await appeal(a.decision.id, ModerationAppealStatus.OVERTURNED);
    await decide(a.id, ModerationStatus.APPROVED, 20);
    await prisma.mediaAsset.update({
      where: { id: a.id },
      data: { moderationStatus: ModerationStatus.APPROVED },
    });
    await retention.runOnce(new Date());
    expect(await isPurged(a.id)).toBe(false);
  });

  it('deletes an upload never attached to a design after 7 days', async () => {
    const old = await makeAsset({ ageDays: 8, attached: false });
    const recent = await makeAsset({ ageDays: 6, attached: false });
    await retention.runOnce(new Date());
    expect(await isPurged(old.id)).toBe(true);
    expect(await isPurged(recent.id)).toBe(false);
  });

  it('deletes a stalled PENDING or FAILED asset after 7 days', async () => {
    const stalled = await makeAsset({
      ageDays: 8,
      status: MediaAssetStatus.PENDING,
    });
    const failed = await makeAsset({
      ageDays: 9,
      status: MediaAssetStatus.FAILED,
    });
    const fresh = await makeAsset({
      ageDays: 2,
      status: MediaAssetStatus.PENDING,
    });
    await retention.runOnce(new Date());
    expect(await isPurged(stalled.id)).toBe(true);
    expect(await isPurged(failed.id)).toBe(true);
    expect(await isPurged(fresh.id)).toBe(false);
  });

  it('never deletes a ready, approved, attached upload or a public catalogue image', async () => {
    const live = await makeAsset({ ageDays: 90 });
    const pub = await makeAsset({
      ageDays: 90,
      visibility: MediaVisibility.PUBLIC,
      status: MediaAssetStatus.FAILED,
      attached: false,
    });
    await retention.runOnce(new Date());
    expect(await isPurged(live.id)).toBe(false);
    expect(await isPurged(pub.id)).toBe(false);
  });

  it('keeps the row and retries next run when storage is down', async () => {
    const a = await rejected(20);
    s3.failFor = a.id;
    const first = await retention.runOnce(new Date());
    expect(first.failed).toBeGreaterThanOrEqual(1);
    expect(await isPurged(a.id)).toBe(false);
    s3.failFor = null;
    await retention.runOnce(new Date());
    expect(await isPurged(a.id)).toBe(true);
  });

  it('is idempotent: a second run deletes nothing more for purged assets', async () => {
    const a = await rejected(20);
    await retention.runOnce(new Date());
    s3.deleted = [];
    await retention.runOnce(new Date());
    expect(s3.deleted.some((k) => k.includes(a.id))).toBe(false);
  });

  it('survives two runs at the same time', async () => {
    const a = await rejected(20);
    const b = await rejected(21);
    const [r1, r2] = await Promise.all([
      retention.runOnce(new Date()),
      retention.runOnce(new Date()),
    ]);
    expect(r1.failed + r2.failed).toBe(0);
    expect(await isPurged(a.id)).toBe(true);
    expect(await isPurged(b.id)).toBe(true);
  });

  it('handles at most one batch per run', async () => {
    await rejected(30);
    await rejected(31);
    const summary = await retention.runOnce(new Date(), { batchSize: 1 });
    expect(summary.selected).toBeLessThanOrEqual(1);
  });
});
