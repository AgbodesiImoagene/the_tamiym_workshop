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
import { UpdateCampaignBasicsDto } from './dto/update-campaign-basics.dto';
import {
  AddCampaignOfferDto,
  UpdateCampaignOfferDto,
  RemoveCampaignOfferDto,
} from './dto/campaign-offer.dto';
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
import {
  ORGANISER_CAMPAIGN_AUTHORING_POLICY_VERSION,
  CampaignAuthoringErrorCode,
  CAMPAIGN_PRICE_FLOOR_GUIDANCE,
} from './campaign-authoring.constants';
import {
  assertCampaignFound,
  assertDraftMutable,
  assertOwned,
  authoringBadRequest,
  authoringConflict,
  priceGuidancePayload,
  staleRevisionConflict,
  validateDateOrder,
  validateGoalAmount,
  validateOfferPrice,
  validateSlug,
  validateTitle,
} from './campaign-authoring.helpers';
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

/** Legacy mutable statuses for deprecated addProduct path (pre-TTW-035). Prefer DRAFT-only offer APIs. */
const MUTABLE_STATUSES = new Set<CampaignStatus>([
  CampaignStatus.DRAFT,
  CampaignStatus.PAUSED,
]);

const OWNER_OFFER_INCLUDE = {
  product: { select: { id: true, name: true, slug: true, status: true } },
  design: {
    select: {
      id: true,
      name: true,
      thumbnailUrl: true,
      moderationStatus: true,
    },
  },
  prices: true,
} as const;

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
    validateDateOrder(startDate, endDate);
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
   * Get campaign by ID (organizer, own only) — owner detail DTO with offers + price guidance.
   */
  async findOne(organizerId: string, id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        products: {
          include: OWNER_OFFER_INCLUDE,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    assertCampaignFound(campaign);
    assertOwned(organizerId, campaign.organizerId);
    return this.toOwnerDetailDto(campaign);
  }

  /**
   * Owner-only DRAFT preview via TTW-031 presenter (watermarked, non-purchasable).
   */
  async getOwnerDraftPreview(organizerId: string, id: string) {
    const currency = DEFAULT_CURRENCY;
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
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
    assertCampaignFound(campaign);
    assertOwned(organizerId, campaign.organizerId);

    const products = this.pricingService.buildOwnerDraftPreviewOffers(
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
      draftRevision: campaign.draftRevision,
      goalAmount: campaign.goalAmount ? Number(campaign.goalAmount) : null,
      currentAmount: Number(campaign.currentAmount),
      currency: campaign.currency,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      purchasable: false as const,
      previewWatermark: 'DRAFT' as const,
      authoringPolicyVersion: ORGANISER_CAMPAIGN_AUTHORING_POLICY_VERSION,
      offerPolicyVersion: PUBLIC_CAMPAIGN_OFFER_POLICY_VERSION,
      products,
    };
  }

  /**
   * Server floor guidance for a product+design without leaking cost basis.
   */
  async getPriceGuidance(
    organizerId: string,
    campaignId: string,
    productId: string,
    designId: string,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, organizerId: true, currency: true },
    });
    assertCampaignFound(campaign);
    assertOwned(organizerId, campaign.organizerId);
    await this.assertOwnedDesignForProduct(organizerId, productId, designId);
    const currency = campaign.currency ?? DEFAULT_CURRENCY;
    const minimumPrice = await this.pricingService.getMinCampaignProductPrice(
      productId,
      designId,
      currency,
    );
    return priceGuidancePayload(minimumPrice, currency);
  }

  private async toOwnerDetailDto(campaign: {
    id: string;
    organizerId: string;
    title: string;
    slug: string;
    description: string | null;
    story: string | null;
    status: CampaignStatus;
    moderationStatus: ModerationStatus;
    rejectionReason: string | null;
    moderationNotes?: string | null;
    currency: string;
    goalAmount: unknown;
    currentAmount: unknown;
    draftRevision: number;
    startDate: Date | null;
    endDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
    products: Array<{
      id: string;
      productId: string;
      designId: string | null;
      product: {
        id: string;
        name: string;
        slug: string;
        status: string;
      };
      design: {
        id: string;
        name: string;
        thumbnailUrl: string | null;
        moderationStatus: ModerationStatus;
      } | null;
      prices: Array<{ currency: string; amount: unknown }>;
    }>;
  }) {
    const currency = campaign.currency ?? DEFAULT_CURRENCY;
    const offers = await Promise.all(
      campaign.products.map(async (cp) => {
        const priceRow =
          cp.prices.find((p) => p.currency === currency) ?? cp.prices[0];
        const price = priceRow ? Number(priceRow.amount) : null;
        const minimumPrice =
          await this.pricingService.getMinCampaignProductPrice(
            cp.productId,
            cp.designId,
            currency,
          );
        return {
          id: cp.id,
          productId: cp.productId,
          designId: cp.designId,
          product: cp.product,
          design: cp.design
            ? {
                id: cp.design.id,
                name: cp.design.name,
                thumbnailUrl: cp.design.thumbnailUrl,
                moderationStatus: cp.design.moderationStatus,
              }
            : null,
          price,
          currency,
          minimumPrice,
          priceGuidance: CAMPAIGN_PRICE_FLOOR_GUIDANCE,
        };
      }),
    );

    const base = this.toOrganizerCampaign(campaign);
    return {
      ...base,
      goalAmount: campaign.goalAmount ? Number(campaign.goalAmount) : null,
      currentAmount: Number(campaign.currentAmount),
      draftRevision: campaign.draftRevision,
      authoringPolicyVersion: ORGANISER_CAMPAIGN_AUTHORING_POLICY_VERSION,
      offers,
      // Keep products for transitional clients; prefer offers.
      products: campaign.products.map((cp) => ({
        id: cp.id,
        productId: cp.productId,
        designId: cp.designId,
        product: {
          id: cp.product.id,
          name: cp.product.name,
          slug: cp.product.slug,
        },
        design: cp.design ? { id: cp.design.id, name: cp.design.name } : null,
      })),
    };
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
   * Update campaign basics (organizer, owned DRAFT only) with expectedRevision.
   */
  async update(organizerId: string, id: string, dto: UpdateCampaignBasicsDto) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    assertCampaignFound(campaign);
    assertOwned(organizerId, campaign.organizerId);
    assertDraftMutable(campaign.status);

    if (dto.title !== undefined) validateTitle(dto.title);
    if (dto.goalAmount !== undefined) validateGoalAmount(dto.goalAmount);

    const slug =
      dto.slug !== undefined
        ? dto.slug.trim()
        : dto.title
          ? this.slugify(dto.title)
          : undefined;
    if (slug !== undefined) {
      validateSlug(slug);
      const existing = await this.prisma.campaign.findFirst({
        where: { slug, id: { not: id } },
      });
      if (existing) {
        throw authoringConflict(
          CampaignAuthoringErrorCode.SLUG_TAKEN,
          `Campaign with slug "${slug}" already exists`,
        );
      }
    }

    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      const effectiveStart =
        dto.startDate !== undefined
          ? dto.startDate
          : (campaign.startDate?.toISOString() ?? null);
      const effectiveEnd =
        dto.endDate !== undefined
          ? dto.endDate
          : (campaign.endDate?.toISOString() ?? null);
      validateDateOrder(effectiveStart, effectiveEnd);
    }

    const updated = await this.prisma.campaign.updateMany({
      where: {
        id,
        organizerId,
        status: CampaignStatus.DRAFT,
        draftRevision: dto.expectedRevision,
      },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(slug !== undefined && { slug }),
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
        draftRevision: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const latest = await this.prisma.campaign.findUnique({
        where: { id },
        select: { draftRevision: true, status: true, organizerId: true },
      });
      if (!latest || latest.organizerId !== organizerId) {
        throw new NotFoundException('Campaign not found');
      }
      if (latest.status !== CampaignStatus.DRAFT) {
        assertDraftMutable(latest.status);
      }
      throw staleRevisionConflict(latest.draftRevision);
    }

    return this.findOne(organizerId, id);
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
   * Add offer to campaign (owned DRAFT): product + owned design + price atomically.
   */
  async addOffer(
    campaignId: string,
    organizerId: string,
    dto: AddCampaignOfferDto,
  ) {
    return this.mutateOwnedDraftOffer(
      campaignId,
      organizerId,
      dto.expectedRevision,
      async (tx, campaign) => {
        await this.assertOfferWritable(tx, organizerId, campaignId, {
          productId: dto.productId,
          designId: dto.designId,
          excludeOfferId: null,
        });
        const currency = campaign.currency ?? DEFAULT_CURRENCY;
        const minimumPrice =
          await this.pricingService.getMinCampaignProductPrice(
            dto.productId,
            dto.designId,
            currency,
          );
        validateOfferPrice(dto.price, minimumPrice, currency);

        try {
          const cp = await tx.campaignProduct.create({
            data: {
              campaignId,
              productId: dto.productId,
              designId: dto.designId,
            },
          });
          await tx.campaignProductPrice.create({
            data: {
              campaignProductId: cp.id,
              currency: DEFAULT_CURRENCY,
              amount: dto.price,
            },
          });
        } catch (err) {
          if (
            err &&
            typeof err === 'object' &&
            'code' in err &&
            (err as { code: string }).code === 'P2002'
          ) {
            throw authoringConflict(
              CampaignAuthoringErrorCode.OFFER_DUPLICATE,
              'This product and design are already offered on the campaign',
            );
          }
          throw err;
        }
      },
    );
  }

  /**
   * Update an existing offer (design and/or price) atomically on owned DRAFT.
   */
  async updateOffer(
    campaignId: string,
    offerId: string,
    organizerId: string,
    dto: UpdateCampaignOfferDto,
  ) {
    if (dto.designId === undefined && dto.price === undefined) {
      throw authoringBadRequest(
        CampaignAuthoringErrorCode.PRICE_INVALID,
        'Provide designId and/or price to update',
      );
    }
    return this.mutateOwnedDraftOffer(
      campaignId,
      organizerId,
      dto.expectedRevision,
      async (tx, campaign) => {
        const existing = await tx.campaignProduct.findFirst({
          where: { id: offerId, campaignId },
          include: { prices: true },
        });
        if (!existing) {
          throw authoringBadRequest(
            CampaignAuthoringErrorCode.OFFER_NOT_FOUND,
            'Campaign offer not found',
          );
        }
        const nextDesignId = dto.designId ?? existing.designId;
        if (!nextDesignId) {
          throw authoringBadRequest(
            CampaignAuthoringErrorCode.DESIGN_NOT_FOUND,
            'Offer must have a design',
          );
        }
        await this.assertOfferWritable(tx, organizerId, campaignId, {
          productId: existing.productId,
          designId: nextDesignId,
          excludeOfferId: offerId,
        });

        const currency = campaign.currency ?? DEFAULT_CURRENCY;
        const nextPrice =
          dto.price !== undefined
            ? dto.price
            : Number(
                existing.prices.find((p) => p.currency === currency)?.amount ??
                  existing.prices[0]?.amount,
              );
        if (!Number.isFinite(nextPrice)) {
          throw authoringBadRequest(
            CampaignAuthoringErrorCode.PRICE_INVALID,
            'Offer must have a positive NGN price',
          );
        }
        const minimumPrice =
          await this.pricingService.getMinCampaignProductPrice(
            existing.productId,
            nextDesignId,
            currency,
          );
        validateOfferPrice(nextPrice, minimumPrice, currency);

        try {
          await tx.campaignProduct.update({
            where: { id: offerId },
            data: { designId: nextDesignId },
          });
        } catch (err) {
          if (
            err &&
            typeof err === 'object' &&
            'code' in err &&
            (err as { code: string }).code === 'P2002'
          ) {
            throw authoringConflict(
              CampaignAuthoringErrorCode.OFFER_DUPLICATE,
              'This product and design are already offered on the campaign',
            );
          }
          throw err;
        }

        const priceRow = existing.prices.find((p) => p.currency === currency);
        if (priceRow) {
          await tx.campaignProductPrice.update({
            where: { id: priceRow.id },
            data: { amount: nextPrice },
          });
        } else {
          await tx.campaignProductPrice.create({
            data: {
              campaignProductId: offerId,
              currency: DEFAULT_CURRENCY,
              amount: nextPrice,
            },
          });
        }
      },
    );
  }

  /**
   * Remove an offer atomically on owned DRAFT.
   */
  async removeOffer(
    campaignId: string,
    offerId: string,
    organizerId: string,
    dto: RemoveCampaignOfferDto,
  ) {
    return this.mutateOwnedDraftOffer(
      campaignId,
      organizerId,
      dto.expectedRevision,
      async (tx) => {
        const existing = await tx.campaignProduct.findFirst({
          where: { id: offerId, campaignId },
        });
        if (!existing) {
          throw authoringBadRequest(
            CampaignAuthoringErrorCode.OFFER_NOT_FOUND,
            'Campaign offer not found',
          );
        }
        await tx.campaignProductPrice.deleteMany({
          where: { campaignProductId: offerId },
        });
        await tx.campaignProduct.delete({ where: { id: offerId } });
      },
    );
  }

  /**
   * @deprecated Prefer addOffer. Legacy path kept for transitional callers; still validates design ownership when designId set and requires price ≥ floor when price set. Not revision-safe.
   */
  async addProduct(
    campaignId: string,
    organizerId: string,
    dto: AddCampaignProductDto,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    assertCampaignFound(campaign);
    assertOwned(organizerId, campaign.organizerId);
    if (!MUTABLE_STATUSES.has(campaign.status)) {
      throw new BadRequestException(
        `Cannot modify products on a campaign in ${campaign.status} status. ` +
          `Products can only be added or removed while the campaign is DRAFT or PAUSED.`,
      );
    }
    if (!dto.designId || dto.price == null) {
      throw authoringBadRequest(
        CampaignAuthoringErrorCode.PRICE_INVALID,
        'designId and price are required; use POST /campaigns/:id/offers',
      );
    }
    // Bridge to revision-safe offer API using current revision.
    return this.addOffer(campaignId, organizerId, {
      expectedRevision: campaign.draftRevision,
      productId: dto.productId,
      designId: dto.designId,
      price: dto.price,
    }).then(async () => {
      const detail = await this.findOne(organizerId, campaignId);
      const offer = detail.offers.find(
        (o) => o.productId === dto.productId && o.designId === dto.designId,
      );
      return offer
        ? {
            id: offer.id,
            campaignId,
            productId: offer.productId,
            designId: offer.designId,
            product: offer.product,
            design: offer.design
              ? { id: offer.design.id, name: offer.design.name }
              : null,
            prices:
              offer.price != null
                ? [{ currency: offer.currency, amount: offer.price }]
                : [],
          }
        : null;
    });
  }

  private async mutateOwnedDraftOffer(
    campaignId: string,
    organizerId: string,
    expectedRevision: number,
    work: (
      tx: PrismaService,
      campaign: { id: string; currency: string; draftRevision: number },
    ) => Promise<void>,
  ) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const campaign = await tx.campaign.findUnique({
          where: { id: campaignId },
        });
        assertCampaignFound(campaign);
        assertOwned(organizerId, campaign.organizerId);
        assertDraftMutable(campaign.status);
        if (campaign.draftRevision !== expectedRevision) {
          throw staleRevisionConflict(campaign.draftRevision);
        }

        await work(tx as unknown as PrismaService, campaign);

        const bumped = await tx.campaign.updateMany({
          where: {
            id: campaignId,
            organizerId,
            status: CampaignStatus.DRAFT,
            draftRevision: expectedRevision,
          },
          data: { draftRevision: { increment: 1 } },
        });
        if (bumped.count === 0) {
          throw staleRevisionConflict();
        }
      });
    } catch (err) {
      if (
        err instanceof ConflictException ||
        err instanceof BadRequestException ||
        err instanceof ForbiddenException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      throw err;
    }
    return this.findOne(organizerId, campaignId);
  }

  private async assertOfferWritable(
    tx: {
      product: { findUnique: (args: any) => Promise<{ id: string } | null> };
      design: {
        findUnique: (args: any) => Promise<{
          id: string;
          userId: string;
          productId: string;
        } | null>;
      };
      campaignProduct: {
        findFirst: (args: any) => Promise<{ id: string } | null>;
      };
    },
    organizerId: string,
    campaignId: string,
    args: {
      productId: string;
      designId: string;
      excludeOfferId: string | null;
    },
  ) {
    const product = await tx.product.findUnique({
      where: { id: args.productId },
    });
    if (!product) {
      throw authoringBadRequest(
        CampaignAuthoringErrorCode.PRODUCT_NOT_FOUND,
        'Product not found',
      );
    }
    const design = await tx.design.findUnique({
      where: { id: args.designId },
    });
    if (!design) {
      throw authoringBadRequest(
        CampaignAuthoringErrorCode.DESIGN_NOT_FOUND,
        'Design not found',
      );
    }
    if (design.userId !== organizerId) {
      throw authoringBadRequest(
        CampaignAuthoringErrorCode.DESIGN_NOT_OWNED,
        'Design does not belong to this organiser',
      );
    }
    if (design.productId !== args.productId) {
      throw authoringBadRequest(
        CampaignAuthoringErrorCode.DESIGN_PRODUCT_MISMATCH,
        'Design does not belong to this product',
      );
    }
    const duplicate = await tx.campaignProduct.findFirst({
      where: {
        campaignId,
        productId: args.productId,
        designId: args.designId,
        ...(args.excludeOfferId ? { id: { not: args.excludeOfferId } } : {}),
      },
    });
    if (duplicate) {
      throw authoringConflict(
        CampaignAuthoringErrorCode.OFFER_DUPLICATE,
        'This product and design are already offered on the campaign',
      );
    }
  }

  private async assertOwnedDesignForProduct(
    organizerId: string,
    productId: string,
    designId: string,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw authoringBadRequest(
        CampaignAuthoringErrorCode.PRODUCT_NOT_FOUND,
        'Product not found',
      );
    }
    const design = await this.prisma.design.findUnique({
      where: { id: designId },
    });
    if (!design) {
      throw authoringBadRequest(
        CampaignAuthoringErrorCode.DESIGN_NOT_FOUND,
        'Design not found',
      );
    }
    if (design.userId !== organizerId) {
      throw authoringBadRequest(
        CampaignAuthoringErrorCode.DESIGN_NOT_OWNED,
        'Design does not belong to this organiser',
      );
    }
    if (design.productId !== productId) {
      throw authoringBadRequest(
        CampaignAuthoringErrorCode.DESIGN_PRODUCT_MISMATCH,
        'Design does not belong to this product',
      );
    }
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
            prices: true,
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw authoringBadRequest(
        CampaignAuthoringErrorCode.NOT_DRAFT,
        `Only DRAFT campaigns can be submitted for review (current status: ${campaign.status})`,
      );
    }

    const blockers: Array<{
      code: CampaignAuthoringErrorCode;
      message: string;
    }> = [];
    if (!campaign.title?.trim()) {
      blockers.push({
        code: CampaignAuthoringErrorCode.SUBMIT_MISSING_TITLE,
        message: 'Campaign must have a title before submitting for review',
      });
    }
    if (campaign.products.length === 0) {
      blockers.push({
        code: CampaignAuthoringErrorCode.SUBMIT_NO_OFFERS,
        message: 'Add at least one product offer with a design and price',
      });
    } else {
      const currency = campaign.currency ?? DEFAULT_CURRENCY;
      for (const cp of campaign.products) {
        const priceRow =
          cp.prices.find((p) => p.currency === currency) ?? cp.prices[0];
        const amount = priceRow ? Number(priceRow.amount) : NaN;
        if (!cp.designId || !Number.isFinite(amount) || amount <= 0) {
          blockers.push({
            code: CampaignAuthoringErrorCode.SUBMIT_OFFER_PRICE_INVALID,
            message:
              'Every offer must include an owned design and a positive NGN price',
          });
          break;
        }
      }
    }
    if (blockers.length > 0) {
      const first = blockers[0];
      if (first) {
        throw authoringBadRequest(first.code, first.message, { blockers });
      }
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
