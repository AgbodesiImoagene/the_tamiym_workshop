import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { ModerationDecisionService } from '../moderation/moderation-decision.service';
import {
  aiReasonCodesForOutcome,
  hashRevision,
} from '../moderation/moderation.constants';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { AddCampaignProductDto } from './dto/add-campaign-product.dto';
import {
  CampaignStatus,
  ModerationStatus,
  ModerationSubjectType,
  PayoutMode,
} from '../generated/prisma/enums';
import { DEFAULT_CURRENCY } from '../constants';
import { PricingService } from '../pricing/pricing.service';
import { PUBLIC_CAMPAIGN_OFFER_POLICY_VERSION } from '../pricing/campaign-line-price';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../generated/prisma/enums';
import type { UserRole } from '../generated/prisma/client';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import {
  ADMIN_NOTIF_CAMPAIGN_ACTIVATED,
  ADMIN_NOTIF_CAMPAIGN_AI_AUTO_REJECTED,
  ADMIN_NOTIF_CAMPAIGN_REJECTED_BY_ADMIN,
  ADMIN_NOTIF_CAMPAIGN_STATUS_CHANGED,
  ADMIN_NOTIF_CAMPAIGN_SUBMITTED_FOR_REVIEW,
} from '../admin-notifications/admin-notification-events';

/** Campaign statuses that allow mutation (products/designs can be added/removed). */
const MUTABLE_STATUSES = new Set<CampaignStatus>([
  CampaignStatus.DRAFT,
  CampaignStatus.PAUSED,
]);

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private prisma: PrismaService,
    private pricingService: PricingService,
    private audit: AuditService,
    private moderationService: ModerationService,
    private moderationDecisions: ModerationDecisionService,
    private adminNotify: AdminNotifyService,
  ) {}

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '');
  }

  /** Throw if endDate is provided and is not after startDate. */
  private assertDateOrder(
    startDate?: string | null,
    endDate?: string | null,
  ): void {
    if (!startDate || !endDate) return;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
      throw new BadRequestException('endDate must be after startDate');
    }
  }

  private isCampaignExpired(
    endDate?: Date | null,
    now: Date = new Date(),
  ): boolean {
    return !!endDate && endDate.getTime() <= now.getTime();
  }

  private async transitionCampaignToEnded(
    campaign: { id: string; title: string; status: CampaignStatus },
    now: Date,
  ) {
    const updated = await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.ENDED },
    });

    await this.audit.log({
      eventName: 'system.campaign.ended',
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Campaign',
      entityId: campaign.id,
      actorUserId: null,
      actorRole: null,
      before: { status: campaign.status },
      after: { status: CampaignStatus.ENDED },
      note: `Campaign automatically ended at ${now.toISOString()} because endDate passed.`,
    });

    await this.adminNotify.emit(ADMIN_NOTIF_CAMPAIGN_STATUS_CHANGED, {
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      previousStatus: campaign.status,
      newStatus: CampaignStatus.ENDED,
      actorUserId: '',
    });

    return updated;
  }

  /**
   * Create a campaign (organizer)
   */
  async create(organizerId: string, dto: CreateCampaignDto) {
    const slug = dto.slug ?? this.slugify(dto.title);
    const existing = await this.prisma.campaign.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new ConflictException(
        `Campaign with slug "${slug}" already exists`,
      );
    }
    this.assertDateOrder(dto.startDate, dto.endDate);
    const created = await this.prisma.campaign.create({
      data: {
        organizerId,
        title: dto.title,
        slug,
        description: dto.description,
        story: dto.story,
        status: CampaignStatus.DRAFT,
        currency: DEFAULT_CURRENCY,
        goalAmount: dto.goalAmount,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
    return this.toOrganizerCampaign(created);
  }

  /**
   * Organizer API view: keep moderationStatus / rejectionReason, never expose notes.
   */
  private toOrganizerCampaign<T extends { moderationNotes?: string | null }>(
    campaign: T,
  ): Omit<T, 'moderationNotes'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip internal notes
    const { moderationNotes, ...rest } = campaign;
    return rest;
  }

  /**
   * List campaigns for organizer
   */
  async findAll(organizerId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizerId },
      orderBy: { createdAt: 'desc' },
      include: {
        products: {
          include: {
            product: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    return campaigns.map((c) => this.toOrganizerCampaign(c));
  }

  /**
   * Get campaign by ID (organizer, own only)
   */
  async findOne(organizerId: string, id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            product: { select: { id: true, name: true, slug: true } },
            design: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (campaign.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }
    return this.toOrganizerCampaign(campaign);
  }

  /**
   * Get full campaign detail for admin review — no ownership check.
   * Includes organizer, all campaign products with their linked designs and
   * design moderation statuses, plus the campaign content fields needed for review.
   */
  async adminFindOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        organizer: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        products: {
          include: {
            product: { select: { id: true, name: true, slug: true } },
            design: {
              select: {
                id: true,
                name: true,
                thumbnailUrl: true,
                moderationStatus: true,
                moderationNotes: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  /**
   * Update campaign (organizer, own only)
   */
  async update(organizerId: string, id: string, dto: UpdateCampaignDto) {
    await this.findOne(organizerId, id);
    const slug = dto.slug ?? (dto.title ? this.slugify(dto.title) : undefined);
    if (slug) {
      const existing = await this.prisma.campaign.findFirst({
        where: { slug, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(
          `Campaign with slug "${slug}" already exists`,
        );
      }
    }
    // Validate date ordering when either date is being changed.
    // Fetch current values so a partial update (only startDate or only endDate)
    // is also checked against the persisted counterpart.
    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      const current = await this.prisma.campaign.findUnique({
        where: { id },
        select: { startDate: true, endDate: true },
      });
      const effectiveStart =
        dto.startDate !== undefined
          ? dto.startDate
          : (current?.startDate?.toISOString() ?? null);
      const effectiveEnd =
        dto.endDate !== undefined
          ? dto.endDate
          : (current?.endDate?.toISOString() ?? null);
      this.assertDateOrder(effectiveStart, effectiveEnd);
    }
    return this.toOrganizerCampaign(
      await this.prisma.campaign.update({
        where: { id },
        data: {
          ...(dto.title && { title: dto.title }),
          ...(slug && { slug }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.story !== undefined && { story: dto.story }),
          ...(dto.goalAmount !== undefined && { goalAmount: dto.goalAmount }),
          ...(dto.startDate !== undefined && {
            startDate: dto.startDate ? new Date(dto.startDate) : null,
          }),
          ...(dto.endDate !== undefined && {
            endDate: dto.endDate ? new Date(dto.endDate) : null,
          }),
        },
      }),
    );
  }

  /**
   * Set or clear campaign payout mode override (admin only).
   * Send `null` to clear override and use site default.
   */
  async updatePayoutPolicyForAdmin(
    campaignId: string,
    payoutModeOverride: PayoutMode | null | undefined,
    actorUserId?: string,
  ) {
    if (payoutModeOverride === undefined) {
      throw new BadRequestException(
        'payoutModeOverride is required (use null to clear override and use site default)',
      );
    }
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { payoutModeOverride },
    });
    await this.audit.log({
      eventName: 'admin.campaign.payoutPolicy.updated',
      action: AuditAction.UPDATE,
      entityType: 'Campaign',
      entityId: campaignId,
      actorUserId: actorUserId ?? null,
      before: { payoutModeOverride: campaign.payoutModeOverride },
      after: { payoutModeOverride },
      note: 'Admin updated campaign payout mode override',
    });
    return updated;
  }

  /**
   * Add product to campaign (organizer)
   */
  async addProduct(
    campaignId: string,
    organizerId: string,
    dto: AddCampaignProductDto,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (campaign.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }
    if (!MUTABLE_STATUSES.has(campaign.status)) {
      throw new BadRequestException(
        `Cannot modify products on a campaign in ${campaign.status} status. ` +
          `Products can only be added or removed while the campaign is DRAFT or PAUSED.`,
      );
    }
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new BadRequestException('Product not found');
    }
    const designId = dto.designId ?? null;
    if (designId) {
      const design = await this.prisma.design.findUnique({
        where: { id: designId },
      });
      if (!design) {
        throw new BadRequestException('Design not found');
      }
      if (design.productId !== dto.productId) {
        throw new BadRequestException('Design does not belong to this product');
      }
    }

    const cp = await this.prisma.campaignProduct.create({
      data: {
        campaignId,
        productId: dto.productId,
        designId,
      },
      include: {
        product: { select: { id: true, name: true, slug: true } },
        design: { select: { id: true, name: true } },
      },
    });

    if (dto.price != null && dto.price > 0) {
      const currency = campaign.currency ?? DEFAULT_CURRENCY;
      const minPrice = await this.pricingService.getMinCampaignProductPrice(
        dto.productId,
        designId,
        currency,
      );
      if (dto.price < minPrice) {
        throw new BadRequestException(
          `Campaign price must be at least ${minPrice} ${currency} (max organizer cost across variants for this product${designId ? ' and design' : ''}).`,
        );
      }
      await this.prisma.campaignProductPrice.create({
        data: {
          campaignProductId: cp.id,
          currency: DEFAULT_CURRENCY,
          amount: dto.price,
        },
      });
    }

    return this.prisma.campaignProduct.findUnique({
      where: { id: cp.id },
      include: {
        product: { select: { id: true, name: true, slug: true } },
        design: { select: { id: true, name: true } },
        prices: true,
      },
    });
  }

  /**
   * Get campaign by slug (public, read-only).
   * Returns a disclosure-safe payload with sellable offers (TTW-031).
   */
  async getBySlug(slug: string) {
    const currency = DEFAULT_CURRENCY;
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug, status: CampaignStatus.ACTIVE },
      include: {
        organizer: {
          select: { firstName: true, lastName: true },
        },
        products: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                status: true,
                options: {
                  orderBy: { sortOrder: 'asc' },
                  include: {
                    values: { orderBy: { sortOrder: 'asc' } },
                  },
                },
                variants: {
                  include: {
                    inventory: {
                      select: {
                        trackInventory: true,
                        stockOnHand: true,
                        reserved: true,
                      },
                    },
                    optionValues: {
                      include: {
                        option: {
                          select: { id: true, code: true, sortOrder: true },
                        },
                        optionValue: {
                          select: {
                            id: true,
                            valueCode: true,
                            displayName: true,
                            sortOrder: true,
                            upcharges: {
                              where: { currency: currency as never },
                              take: 1,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            design: {
              select: {
                id: true,
                name: true,
                thumbnailUrl: true,
                moderationStatus: true,
              },
            },
            prices: { where: { currency: currency as never } },
          },
        },
      },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    const now = new Date();
    if (campaign.startDate && campaign.startDate.getTime() > now.getTime()) {
      throw new NotFoundException('Campaign not found');
    }
    if (this.isCampaignExpired(campaign.endDate, now)) {
      await this.transitionCampaignToEnded(campaign, now);
      throw new NotFoundException('Campaign not found');
    }

    const products = this.pricingService.buildPublicCampaignOffers(
      campaign.products,
      campaign.currency ?? currency,
    );

    return {
      id: campaign.id,
      title: campaign.title,
      slug: campaign.slug,
      description: campaign.description,
      story: campaign.story,
      status: campaign.status,
      goalAmount: campaign.goalAmount ? Number(campaign.goalAmount) : null,
      currentAmount: Number(campaign.currentAmount),
      currency: campaign.currency,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      organizer: campaign.organizer
        ? {
            firstName: campaign.organizer.firstName,
            lastName: campaign.organizer.lastName,
          }
        : null,
      performance: {
        currentAmount: Number(campaign.currentAmount),
        goalAmount: campaign.goalAmount ? Number(campaign.goalAmount) : null,
        currency: campaign.currency,
      },
      offerPolicyVersion: PUBLIC_CAMPAIGN_OFFER_POLICY_VERSION,
      products,
    };
  }

  /**
   * List campaigns (admin). Filter by status optional.
   */
  async findAllForAdmin(status?: CampaignStatus) {
    const where = status ? { status } : {};
    return this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        organizer: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        products: {
          include: {
            product: { select: { id: true, name: true } },
            design: {
              select: {
                id: true,
                name: true,
                moderationStatus: true,
                moderationNotes: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Submit a campaign for admin review (organiser action, DRAFT → REVIEW).
   *
   * Triggers AI moderation on the campaign's text content. The result is stored
   * on the campaign record and surfaces in the admin review queue:
   *  - REJECTED by AI → campaign transitions back to DRAFT with the AI reason as
   *    rejectionReason; the organiser must fix and resubmit.
   *  - FLAGGED by AI  → stays in REVIEW with elevated priority for human review.
   *  - APPROVED by AI → stays in REVIEW with lower priority; human still approves.
   *
   * Products/designs are locked after this call; the campaign cannot be mutated
   * until it is rejected back to DRAFT.
   */
  async submitForReview(id: string, organizerId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            design: { select: { id: true, moderationStatus: true } },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException(
        `Only DRAFT campaigns can be submitted for review (current status: ${campaign.status})`,
      );
    }
    if (!campaign.title?.trim()) {
      throw new BadRequestException(
        'Campaign must have a title before submitting for review',
      );
    }

    // Build the text content to screen (title + description + story).
    const textParts = [campaign.title, campaign.description, campaign.story]
      .filter(Boolean)
      .join('\n\n');

    const moderationResult =
      await this.moderationService.moderateText(textParts);

    this.logger.log(
      `Campaign ${id} AI moderation: status=${moderationResult.status} score=${moderationResult.maxScore.toFixed(3)}`,
    );

    // AI auto-reject: push back to DRAFT immediately so the organiser can fix.
    if (moderationResult.status === ModerationStatus.REJECTED) {
      const rejectionReason =
        'Your campaign content was automatically rejected by our moderation system. ' +
        'Please review and update your campaign title, description, and story, then resubmit.';
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.campaign.update({
          where: { id },
          data: {
            status: CampaignStatus.DRAFT,
          },
        });
        await this.moderationDecisions.recordAiDecisionInTx(tx, {
          subjectType: ModerationSubjectType.CAMPAIGN,
          subjectId: id,
          outcome: ModerationStatus.REJECTED,
          notes: moderationResult.notes,
          maxScore: moderationResult.maxScore,
          customerExplanation: rejectionReason,
          revisionHash: hashRevision({
            title: campaign.title,
            description: campaign.description,
            story: campaign.story,
          }),
          reasonCodes: aiReasonCodesForOutcome(
            ModerationStatus.REJECTED,
            moderationResult.notes,
          ),
          withdrawPendingAppeals: true,
        });
        return tx.campaign.findUniqueOrThrow({ where: { id } });
      });
      await this.audit.log({
        eventName: 'campaign.review.auto_rejected',
        action: AuditAction.STATUS_CHANGE,
        entityType: 'Campaign',
        entityId: id,
        actorUserId: null,
        actorRole: null,
        before: { status: CampaignStatus.DRAFT },
        after: {
          status: CampaignStatus.DRAFT,
          moderationStatus: ModerationStatus.REJECTED,
        },
        note: `AI auto-rejected campaign: ${moderationResult.notes}`,
      });
      await this.adminNotify.emit(ADMIN_NOTIF_CAMPAIGN_AI_AUTO_REJECTED, {
        campaignId: id,
        campaignTitle: campaign.title,
        organizerId,
        moderationNotes: moderationResult.notes,
      });
      return this.toOrganizerCampaign(updated);
    }

    // FLAGGED or APPROVED: move to REVIEW for human inspection.
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { id },
        data: {
          status: CampaignStatus.REVIEW,
        },
      });
      await this.moderationDecisions.recordAiDecisionInTx(tx, {
        subjectType: ModerationSubjectType.CAMPAIGN,
        subjectId: id,
        outcome: moderationResult.status,
        notes: moderationResult.notes,
        maxScore: moderationResult.maxScore,
        revisionHash: hashRevision({
          title: campaign.title,
          description: campaign.description,
          story: campaign.story,
        }),
        reasonCodes: aiReasonCodesForOutcome(
          moderationResult.status,
          moderationResult.notes,
        ),
        withdrawPendingAppeals: true,
      });
      return tx.campaign.findUniqueOrThrow({ where: { id } });
    });
    await this.audit.log({
      eventName: 'campaign.review.submitted',
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Campaign',
      entityId: id,
      actorUserId: organizerId,
      actorRole: null,
      before: { status: CampaignStatus.DRAFT },
      after: {
        status: CampaignStatus.REVIEW,
        moderationStatus: moderationResult.status,
      },
      note: `Organiser submitted campaign for review. AI pre-screen: ${moderationResult.status}`,
    });
    await this.adminNotify.emit(ADMIN_NOTIF_CAMPAIGN_SUBMITTED_FOR_REVIEW, {
      campaignId: id,
      campaignTitle: updated.title,
      organizerId,
      aiModerationStatus: moderationResult.status,
    });
    return this.toOrganizerCampaign(updated);
  }

  /**
   * Activate a campaign (admin, REVIEW → ACTIVE).
   *
   * Validates that all attached designs are APPROVED before activating.
   * Once ACTIVE, the campaign is live and accepting orders.
   */
  async activateForAdmin(
    id: string,
    actorUserId?: string,
    actorRole?: UserRole,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            design: {
              select: { id: true, name: true, moderationStatus: true },
            },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== CampaignStatus.REVIEW) {
      throw new BadRequestException(
        `Only campaigns in REVIEW status can be activated (current: ${campaign.status})`,
      );
    }

    // All attached designs must be APPROVED.
    const blockedDesigns = campaign.products
      .filter(
        (cp) =>
          cp.design && cp.design.moderationStatus !== ModerationStatus.APPROVED,
      )
      .map((cp) => `${cp.design!.name} (${cp.design!.moderationStatus})`);

    if (blockedDesigns.length > 0) {
      throw new BadRequestException(
        `Cannot activate: the following designs are not yet approved: ${blockedDesigns.join(', ')}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { id },
        data: {
          status: CampaignStatus.ACTIVE,
        },
      });
      await this.moderationDecisions.recordAdminDecisionInTx(tx, {
        subjectType: ModerationSubjectType.CAMPAIGN,
        subjectId: id,
        outcome: ModerationStatus.APPROVED,
        actorUserId: actorUserId ?? null,
        notes: 'Admin activated campaign',
        revisionHash: hashRevision({
          title: campaign.title,
          description: campaign.description,
          story: campaign.story,
        }),
        withdrawPendingAppeals: true,
      });
      return tx.campaign.findUniqueOrThrow({ where: { id } });
    });
    await this.audit.log({
      eventName: 'admin.campaign.activated',
      action: AuditAction.ENABLE,
      entityType: 'Campaign',
      entityId: id,
      actorUserId: actorUserId ?? null,
      actorRole: actorRole ?? null,
      before: { status: CampaignStatus.REVIEW },
      after: { status: CampaignStatus.ACTIVE },
      note: 'Admin activated campaign',
    });
    await this.adminNotify.emit(ADMIN_NOTIF_CAMPAIGN_ACTIVATED, {
      campaignId: id,
      campaignTitle: updated.title,
      actorUserId: actorUserId ?? '',
    });
    return updated;
  }

  /**
   * Reject a campaign (admin, REVIEW → DRAFT).
   *
   * Stores the rejection reason which is shown to the organiser.
   * The organiser can then edit and resubmit for review.
   */
  async rejectForAdmin(
    id: string,
    rejectionReason: string,
    notes?: string,
    actorUserId?: string,
    actorRole?: UserRole,
  ) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== CampaignStatus.REVIEW) {
      throw new BadRequestException(
        `Only campaigns in REVIEW status can be rejected (current: ${campaign.status})`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { id },
        data: {
          status: CampaignStatus.DRAFT,
        },
      });
      await this.moderationDecisions.recordAdminDecisionInTx(tx, {
        subjectType: ModerationSubjectType.CAMPAIGN,
        subjectId: id,
        outcome: ModerationStatus.REJECTED,
        actorUserId: actorUserId ?? null,
        notes: notes ?? null,
        customerExplanation: rejectionReason,
        revisionHash: hashRevision({
          title: campaign.title,
          description: campaign.description,
          story: campaign.story,
        }),
        withdrawPendingAppeals: true,
      });
      return tx.campaign.findUniqueOrThrow({ where: { id } });
    });
    await this.audit.log({
      eventName: 'admin.campaign.rejected',
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Campaign',
      entityId: id,
      actorUserId: actorUserId ?? null,
      actorRole: actorRole ?? null,
      before: { status: CampaignStatus.REVIEW },
      after: {
        status: CampaignStatus.DRAFT,
        moderationStatus: ModerationStatus.REJECTED,
      },
      note: `Admin rejected campaign: ${rejectionReason}`,
    });
    await this.adminNotify.emit(ADMIN_NOTIF_CAMPAIGN_REJECTED_BY_ADMIN, {
      campaignId: id,
      campaignTitle: updated.title,
      rejectionReason,
      notes: notes ?? '',
      actorUserId: actorUserId ?? '',
    });
    return updated;
  }

  /**
   * Update campaign status (admin). For DISABLED/PAUSED/ENDED transitions only.
   * Use activateForAdmin() and rejectForAdmin() for the review flow.
   */
  async updateStatusForAdmin(
    id: string,
    status: CampaignStatus,
    actorUserId?: string,
    actorRole?: UserRole,
  ) {
    if (status === CampaignStatus.ACTIVE || status === CampaignStatus.REVIEW) {
      throw new BadRequestException(
        'Use the dedicated activate endpoint to move a campaign to ACTIVE.',
      );
    }
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { status },
    });
    await this.audit.log({
      eventName: 'admin.campaign.status.updated',
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Campaign',
      entityId: id,
      actorUserId: actorUserId ?? null,
      actorRole: actorRole ?? null,
      before: { status: campaign.status },
      after: { status },
      note: `Admin updated campaign status from ${campaign.status} to ${status}`,
    });
    await this.adminNotify.emit(ADMIN_NOTIF_CAMPAIGN_STATUS_CHANGED, {
      campaignId: id,
      campaignTitle: campaign.title,
      previousStatus: campaign.status,
      newStatus: status,
      actorUserId: actorUserId ?? '',
    });
    return updated;
  }

  async endExpiredCampaigns(now: Date = new Date()) {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        status: CampaignStatus.ACTIVE,
        endDate: { lte: now, not: null },
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (campaigns.length === 0) {
      return 0;
    }

    for (const campaign of campaigns) {
      await this.transitionCampaignToEnded(campaign, now);
    }

    this.logger.log(
      `Automatically ended ${campaigns.length} expired campaign(s)`,
    );
    return campaigns.length;
  }
}
