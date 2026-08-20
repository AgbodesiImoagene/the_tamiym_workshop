import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { ModerationDecisionService } from '../moderation/moderation-decision.service';
import {
  aiReasonCodesForOutcome,
  hashRevision,
} from '../moderation/moderation.constants';
import { S3Service } from '../storage/s3.service';
import { CreateDesignDto } from './dto/create-design.dto';
import { UpdateDesignDto } from './dto/update-design.dto';
import {
  ModerationStatus,
  ModerationSubjectType,
} from '../generated/prisma/enums';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import {
  ADMIN_NOTIF_DESIGN_MODERATION_UPDATED,
  ADMIN_NOTIF_DESIGN_SUBMITTED,
} from '../admin-notifications/admin-notification-events';
import {
  DESIGN_SHARE_ALLOWED_TTL_DAYS,
  DESIGN_SHARE_DEFAULT_TTL_DAYS,
  DESIGN_SHARE_POLICY_VERSION,
  DESIGN_SHARE_PUBLIC_ORIGIN_ENV,
} from './design-share.constants';
import {
  hashDesignShareToken,
  mintDesignShareToken,
} from './design-share.crypto';

type DesignDataViews = Record<
  string,
  {
    productViewId?: string;
    fabricJson?: { objects?: unknown[] };
    isUsed?: boolean;
    layerCount?: number;
  }
>;

@Injectable()
export class DesignsService {
  private readonly logger = new Logger(DesignsService.name);

  constructor(
    private prisma: PrismaService,
    private moderationService: ModerationService,
    private moderationDecisions: ModerationDecisionService,
    private s3: S3Service,
    private adminNotify: AdminNotifyService,
    private config: ConfigService,
  ) {}

  /**
   * Return true if `url` originates from our own S3 storage.
   * Any other URL must not be fetched by the moderation service (SSRF risk).
   */
  private isTrustedMediaUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const publicUrl = this.config.get<string>('S3_PUBLIC_URL') ?? '';
      if (publicUrl) {
        const base = new URL(publicUrl);
        if (parsed.hostname === base.hostname) return true;
      }
      const bucket = this.config.get<string>('S3_BUCKET') ?? '';
      if (
        bucket &&
        (parsed.hostname === `${bucket}.s3.amazonaws.com` ||
          parsed.hostname.endsWith('.amazonaws.com'))
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Validate designData is a non-null object (optional: version, views).
   * Also enforces a maximum serialised size to prevent oversized JSON from
   * reaching the database or processing pipeline.
   */
  private validateDesignData(
    designData: unknown,
  ): designData is Record<string, unknown> {
    if (
      designData === null ||
      typeof designData !== 'object' ||
      Array.isArray(designData)
    ) {
      return false;
    }
    // Guard against excessively large payloads (>= 2 MB serialised)
    const serialised = JSON.stringify(designData);
    if (serialised.length > 2_000_000) {
      throw new BadRequestException(
        'designData exceeds the maximum allowed size (2 MB)',
      );
    }
    return true;
  }

  /**
   * Derive a human-readable text summary from designData to screen with the
   * moderation API. Handles both Fabric.js format (objects array with type
   * "i-text"/"textbox") and legacy format (layers array with type "text").
   */
  private extractTextFromDesignData(
    designData: Record<string, unknown>,
  ): string | undefined {
    try {
      const views = designData['views'];
      if (!views || typeof views !== 'object' || Array.isArray(views)) {
        return undefined;
      }
      const texts: string[] = [];
      for (const view of Object.values(views)) {
        const v = view as Record<string, unknown>;
        // Fabric.js format: fabricJson.objects
        const fabricJson = v['fabricJson'] as
          | { objects?: unknown[] }
          | undefined;
        const objects = fabricJson?.objects ?? (v['layers'] as unknown[]);
        if (!Array.isArray(objects)) continue;
        for (const obj of objects) {
          if (!obj || typeof obj !== 'object') continue;
          const o = obj as Record<string, unknown>;
          const type = o['type'];
          // Fabric.js text types: i-text, textbox, text; legacy: "text"
          if (
            type === 'i-text' ||
            type === 'textbox' ||
            type === 'text' ||
            type === 'IText'
          ) {
            const text = o['text'] ?? o['content'];
            if (typeof text === 'string' && text.trim()) {
              texts.push(text.trim());
            }
          }
        }
      }
      return texts.length > 0 ? texts.join(' | ') : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Sync DesignView rows from the views map in designData. Creates or updates
   * one row per view key that has a productViewId. Called after create/update.
   * Validates that each productViewId belongs to the design's product to
   * prevent cross-product IDOR / integrity issues.
   */
  async upsertDesignViews(
    designId: string,
    designData: Record<string, unknown>,
  ): Promise<void> {
    const views = designData['views'] as DesignDataViews | undefined;
    if (!views || typeof views !== 'object') return;

    const design = await this.prisma.design.findUnique({
      where: { id: designId },
      select: { productId: true },
    });
    if (!design) return;

    // Pre-load all valid view IDs for this product to avoid N queries
    const validViews = await this.prisma.productView.findMany({
      where: { productId: design.productId },
      select: { id: true },
    });
    const validViewIds = new Set(validViews.map((v) => v.id));

    for (const [, view] of Object.entries(views)) {
      const productViewId = view?.productViewId;
      if (!productViewId) continue;

      if (!validViewIds.has(productViewId)) {
        this.logger.warn(
          `Skipping DesignView upsert: productViewId=${productViewId} does not belong to product=${design.productId} (designId=${designId})`,
        );
        continue;
      }

      const isUsed = view.isUsed ?? false;
      const layerCount =
        view.layerCount ??
        (Array.isArray(view.fabricJson?.objects)
          ? view.fabricJson.objects.length
          : 0);

      await this.prisma.designView.upsert({
        where: { designId_productViewId: { designId, productViewId } },
        create: { designId, productViewId, isUsed, layerCount },
        update: { isUsed, layerCount },
      });
    }
  }

  /**
   * Run AI moderation on a design's text layers and thumbnail.
   * Returns the moderation status and notes to store on the Design record.
   */
  private async moderateDesign(
    designData: Record<string, unknown>,
    thumbnailUrl?: string | null,
  ): Promise<{
    moderationStatus: ModerationStatus;
    moderationNotes: string;
    maxScore: number;
  }> {
    const text = this.extractTextFromDesignData(designData);

    // Only pass the imageUrl to moderation when it originates from our own
    // S3 bucket. Accepting arbitrary caller-supplied URLs would let users
    // trigger SSRF from the moderation worker.
    let imageUrl: string | undefined;
    if (thumbnailUrl && this.isTrustedMediaUrl(thumbnailUrl)) {
      imageUrl = thumbnailUrl;
    } else if (thumbnailUrl) {
      this.logger.warn(
        `Skipping thumbnail moderation: URL "${thumbnailUrl}" is not from a trusted host`,
      );
    }

    if (!text && !imageUrl) {
      // Nothing to screen — leave at PENDING for human review.
      return {
        moderationStatus: ModerationStatus.PENDING,
        moderationNotes: 'No screenable content (no text layers, no thumbnail)',
        maxScore: 0,
      };
    }

    const result = await this.moderationService.moderate({ text, imageUrl });
    this.logger.log(
      `Design moderation: status=${result.status} score=${result.maxScore.toFixed(3)}`,
    );
    return {
      moderationStatus: result.status,
      moderationNotes: result.notes,
      maxScore: result.maxScore,
    };
  }

  /**
   * Create a design for the current user. Runs AI moderation immediately;
   * result is stored but does not block the save.
   */
  async create(userId: string, dto: CreateDesignDto) {
    if (!this.validateDesignData(dto.designData)) {
      throw new BadRequestException('designData must be a valid object');
    }
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new BadRequestException('Product not found');
    }
    if (product.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Designs can only be created for active products',
      );
    }

    const { moderationStatus, moderationNotes, maxScore } =
      await this.moderateDesign(dto.designData, dto.thumbnailUrl);

    const created = await this.prisma.design.create({
      data: {
        userId,
        productId: dto.productId,
        name: dto.name,
        designData: dto.designData as object,
        thumbnailUrl: dto.thumbnailUrl,
        moderationStatus,
        moderationNotes,
      },
      include: {
        product: { select: { id: true, name: true, slug: true } },
      },
    });

    await this.moderationDecisions.recordAiDecision({
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: created.id,
      outcome: moderationStatus,
      notes: moderationNotes,
      maxScore,
      revisionHash: hashRevision({
        designData: dto.designData,
        thumbnailUrl: dto.thumbnailUrl ?? null,
      }),
      reasonCodes: aiReasonCodesForOutcome(moderationStatus, moderationNotes),
      withdrawPendingAppeals: false,
    });

    await this.upsertDesignViews(created.id, dto.designData);

    await this.adminNotify.emit(ADMIN_NOTIF_DESIGN_SUBMITTED, {
      designId: created.id,
      designName: created.name,
      productName: created.product?.name ?? '',
      userId,
      moderationStatus: created.moderationStatus,
    });

    return created;
  }

  /**
   * List designs for the current user (customer).
   */
  async findAll(userId: string) {
    return this.prisma.design.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  /**
   * Get a single design by ID (customer, own only).
   */
  async findOne(userId: string, id: string) {
    const design = await this.prisma.design.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!design) {
      throw new NotFoundException('Design not found');
    }
    if (design.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return design;
  }

  /**
   * Get a single design for admin review — no ownership check.
   * Includes owner, product, and all design views.
   */
  async adminFindOne(id: string) {
    const design = await this.prisma.design.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        product: { select: { id: true, name: true, slug: true } },
        views: {
          select: {
            id: true,
            productViewId: true,
            isUsed: true,
            layerCount: true,
          },
        },
      },
    });
    if (!design) {
      throw new NotFoundException('Design not found');
    }
    return design;
  }

  /**
   * Update a design (customer, own only). Re-runs AI moderation if designData
   * or thumbnailUrl changes.
   */
  async update(userId: string, id: string, dto: UpdateDesignDto) {
    const existing = await this.findOne(userId, id);
    if (
      dto.designData !== undefined &&
      !this.validateDesignData(dto.designData)
    ) {
      throw new BadRequestException('designData must be a valid object');
    }

    const contentChanged =
      dto.designData !== undefined || dto.thumbnailUrl !== undefined;

    let moderationUpdate: {
      moderationStatus?: ModerationStatus;
      moderationNotes?: string;
      maxScore?: number;
    } = {};

    if (contentChanged) {
      const newData = (dto.designData ?? existing.designData) as Record<
        string,
        unknown
      >;
      const newThumb =
        dto.thumbnailUrl !== undefined
          ? dto.thumbnailUrl
          : existing.thumbnailUrl;
      const { moderationStatus, moderationNotes, maxScore } =
        await this.moderateDesign(newData, newThumb);
      moderationUpdate = { moderationStatus, moderationNotes, maxScore };
    }

    const updated = await this.prisma.design.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.designData !== undefined && {
          designData: dto.designData as object,
        }),
        ...(dto.thumbnailUrl !== undefined && {
          thumbnailUrl: dto.thumbnailUrl,
        }),
        ...(moderationUpdate.moderationStatus !== undefined && {
          moderationStatus: moderationUpdate.moderationStatus,
          moderationNotes: moderationUpdate.moderationNotes,
        }),
      },
      include: {
        product: { select: { id: true, name: true, slug: true } },
      },
    });

    if (contentChanged && moderationUpdate.moderationStatus !== undefined) {
      await this.moderationDecisions.recordAiDecision({
        subjectType: ModerationSubjectType.DESIGN,
        subjectId: id,
        outcome: moderationUpdate.moderationStatus,
        notes: moderationUpdate.moderationNotes,
        maxScore: moderationUpdate.maxScore,
        revisionHash: hashRevision({
          designData: dto.designData ?? existing.designData,
          thumbnailUrl:
            dto.thumbnailUrl !== undefined
              ? dto.thumbnailUrl
              : existing.thumbnailUrl,
        }),
        reasonCodes: aiReasonCodesForOutcome(
          moderationUpdate.moderationStatus,
          moderationUpdate.moderationNotes,
        ),
        withdrawPendingAppeals: true,
      });
    }

    if (dto.designData !== undefined) {
      await this.upsertDesignViews(id, dto.designData);
    }

    return updated;
  }

  /**
   * Delete a design (customer, own only).
   */
  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.design.delete({ where: { id } });
  }

  /**
   * List designs by moderation status (admin). Includes user and product info.
   */
  async findAllByModerationStatus(status?: ModerationStatus) {
    const where = status ? { moderationStatus: status } : {};
    return this.prisma.design.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        product: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  /**
   * Update moderation status (admin). Accepts APPROVED, REJECTED, or FLAGGED.
   * Notes are stored for audit purposes.
   */
  async updateModeration(
    id: string,
    status: ModerationStatus,
    notes?: string,
    actorUserId?: string,
  ) {
    const design = await this.prisma.design.findUnique({ where: { id } });
    if (!design) {
      throw new NotFoundException('Design not found');
    }
    if (
      status !== ModerationStatus.APPROVED &&
      status !== ModerationStatus.REJECTED &&
      status !== ModerationStatus.FLAGGED
    ) {
      throw new BadRequestException(
        'status must be APPROVED, REJECTED, or FLAGGED',
      );
    }

    await this.moderationDecisions.recordAdminDecision({
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: id,
      outcome: status,
      actorUserId: actorUserId ?? null,
      notes: notes ?? null,
      revisionHash: hashRevision({
        designData: design.designData,
        thumbnailUrl: design.thumbnailUrl,
      }),
      withdrawPendingAppeals: true,
    });

    const updated = await this.prisma.design.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { id: true, email: true } },
        product: { select: { id: true, name: true, slug: true } },
      },
    });

    await this.adminNotify.emit(ADMIN_NOTIF_DESIGN_MODERATION_UPDATED, {
      designId: id,
      status,
      designName: updated.name,
      productName: updated.product?.name ?? '',
      ownerEmail: updated.user?.email ?? '',
      notes: notes ?? '',
    });

    return updated;
  }

  /**
   * Upload a thumbnail image for a design. The file is stored directly in S3
   * under `thumbnails/{designId}/thumb.webp`. No MediaAsset record is created —
   * this is a system-generated derivative, not user artwork.
   */
  async uploadThumbnail(
    userId: string,
    id: string,
    file: { buffer: Buffer; mimetype: string },
  ): Promise<{ thumbnailUrl: string }> {
    await this.findOne(userId, id);

    const allowed = ['image/webp', 'image/png', 'image/jpeg'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(
        'Thumbnail must be a PNG, JPEG, or WebP image',
      );
    }

    const ext =
      file.mimetype === 'image/webp'
        ? 'webp'
        : file.mimetype === 'image/jpeg'
          ? 'jpg'
          : 'png';
    const key = `thumbnails/${id}/thumb.${ext}`;
    const { url } = await this.s3.uploadObject({
      key,
      buffer: file.buffer,
      contentType: file.mimetype,
    });

    await this.prisma.design.update({
      where: { id },
      data: { thumbnailUrl: url },
    });

    return { thumbnailUrl: url };
  }

  /**
   * Clone a design (own only). The new design shares the same designData and
   * thumbnailUrl; all DesignView rows are cloned; moderation resets to PENDING.
   * DesignAsset refs inside fabricJson are shared — no re-upload needed.
   */
  async duplicate(userId: string, id: string) {
    const original = await this.prisma.design.findUnique({
      where: { id },
      include: { views: true },
    });
    if (!original) throw new NotFoundException('Design not found');
    if (original.userId !== userId)
      throw new ForbiddenException('Access denied');

    const cloned = await this.prisma.design.create({
      data: {
        userId,
        productId: original.productId,
        name: `Copy of ${original.name}`,
        designData: original.designData as object,
        thumbnailUrl: original.thumbnailUrl,
        moderationStatus: ModerationStatus.PENDING,
        moderationNotes: 'Duplicated from design ' + id,
      },
      include: {
        product: { select: { id: true, name: true, slug: true } },
      },
    });

    if (original.views.length > 0) {
      await this.prisma.designView.createMany({
        data: original.views.map((v) => ({
          designId: cloned.id,
          productViewId: v.productViewId,
          isUsed: v.isUsed,
          layerCount: v.layerCount,
        })),
      });
    }

    return cloned;
  }

  /**
   * Create a digested, expiring share link for an owned APPROVED design.
   * Plaintext bearer is returned once; URL uses configured public origin.
   */
  async createShareLink(
    userId: string,
    designId: string,
    ttlDays: number = DESIGN_SHARE_DEFAULT_TTL_DAYS,
  ): Promise<{
    id: string;
    shareToken: string;
    shareUrl: string;
    expiresAt: Date;
    policyVersion: string;
  }> {
    const design = await this.findOne(userId, designId);
    if (design.moderationStatus !== ModerationStatus.APPROVED) {
      throw new BadRequestException(
        'Only APPROVED designs can be shared publicly',
      );
    }
    if (
      !(DESIGN_SHARE_ALLOWED_TTL_DAYS as readonly number[]).includes(ttlDays)
    ) {
      throw new BadRequestException(
        `ttlDays must be one of: ${DESIGN_SHARE_ALLOWED_TTL_DAYS.join(', ')}`,
      );
    }

    const shareToken = mintDesignShareToken();
    const tokenHash = hashDesignShareToken(shareToken);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    const link = await this.prisma.$transaction(async (tx) => {
      const created = await tx.designShareLink.create({
        data: {
          designId,
          tokenHash,
          policyVersion: DESIGN_SHARE_POLICY_VERSION,
          expiresAt,
        },
      });
      // Clear any legacy plaintext Design.shareToken left from pre-TTW-026.
      await tx.design.update({
        where: { id: designId },
        data: { shareToken: null, shareTokenExpiresAt: null },
      });
      return created;
    });

    return {
      id: link.id,
      shareToken,
      shareUrl: `${this.resolveSharePublicOrigin()}/design/shared/${shareToken}`,
      expiresAt: link.expiresAt,
      policyVersion: link.policyVersion,
    };
  }

  /** @deprecated Use createShareLink — kept name for call-site migration. */
  async generateShareToken(
    userId: string,
    id: string,
  ): Promise<{ shareToken: string; shareUrl: string }> {
    const created = await this.createShareLink(
      userId,
      id,
      DESIGN_SHARE_DEFAULT_TTL_DAYS,
    );
    return { shareToken: created.shareToken, shareUrl: created.shareUrl };
  }

  listShareLinks(userId: string, designId: string) {
    return this.findOne(userId, designId).then(() =>
      this.prisma.designShareLink.findMany({
        where: { designId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          policyVersion: true,
          expiresAt: true,
          revokedAt: true,
          lastAccessedAt: true,
          createdAt: true,
        },
      }),
    );
  }

  async revokeShareLink(
    userId: string,
    designId: string,
    linkId: string,
  ): Promise<{ id: string; revokedAt: Date }> {
    await this.findOne(userId, designId);
    const existing = await this.prisma.designShareLink.findFirst({
      where: { id: linkId, designId },
    });
    if (!existing) throw new NotFoundException('Share link not found');
    if (existing.revokedAt) {
      return { id: existing.id, revokedAt: existing.revokedAt };
    }
    const updated = await this.prisma.designShareLink.update({
      where: { id: linkId },
      data: { revokedAt: new Date() },
    });
    return { id: updated.id, revokedAt: updated.revokedAt! };
  }

  /**
   * Public share lookup by bearer token. Uniform NotFound for every deny path.
   * Does not return the bearer, owner id, or moderation notes.
   */
  async findByShareToken(token: string) {
    if (!token || token.length < 16 || token.length > 128) {
      throw new NotFoundException('Shared design not found');
    }
    const tokenHash = hashDesignShareToken(token);
    const link = await this.prisma.designShareLink.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        design: {
          select: {
            id: true,
            name: true,
            designData: true,
            thumbnailUrl: true,
            moderationStatus: true,
            createdAt: true,
            product: { select: { id: true, name: true, slug: true } },
            views: {
              select: {
                id: true,
                productViewId: true,
                isUsed: true,
                layerCount: true,
              },
            },
          },
        },
      },
    });

    const deny =
      !link ||
      !!link.revokedAt ||
      link.expiresAt.getTime() <= Date.now() ||
      link.design.moderationStatus !== ModerationStatus.APPROVED;
    if (deny) {
      throw new NotFoundException('Shared design not found');
    }

    await this.prisma.designShareLink.update({
      where: { id: link.id },
      data: { lastAccessedAt: new Date() },
    });

    const { moderationStatus: _status, ...safe } = link.design;
    void _status;
    return safe;
  }

  private resolveSharePublicOrigin(): string {
    const configured = this.config
      .get<string>(DESIGN_SHARE_PUBLIC_ORIGIN_ENV)
      ?.trim();
    if (configured) {
      try {
        return new URL(configured).origin;
      } catch {
        throw new BadRequestException(
          `${DESIGN_SHARE_PUBLIC_ORIGIN_ENV} must be a valid absolute origin URL`,
        );
      }
    }
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException(
        `${DESIGN_SHARE_PUBLIC_ORIGIN_ENV} must be configured in production`,
      );
    }
    return 'http://localhost:3002';
  }
}
