import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { DEFAULT_CURRENCY } from '../constants';
import {
  ModerationStatus,
  OrganizerApplicationStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { ORGANIZER_TERMS_VERSION } from '../organizer/organizer.constants';
import {
  CAMPAIGN_READINESS_POLICY_VERSION,
  CampaignReadinessCode,
  CampaignReadinessPhase,
  type CampaignReadinessPhase as ReadinessPhase,
  type CampaignReadinessResult,
} from './campaign-readiness.constants';
import {
  emptyReadinessResult,
  isVariantSellable,
  issue,
} from './campaign-readiness.helpers';
import {
  evaluatePayoutEligibility,
  messageForPayoutEligibilityCode,
  PayoutEligibilityCode,
  PayoutEligibilityGate,
} from '../payouts/payout-eligibility';
import { toEligibilityProfile } from '../payouts/payout-eligibility.helpers';

const OFFER_INCLUDE = {
  product: {
    select: {
      id: true,
      status: true,
      variants: {
        select: {
          id: true,
          isAvailable: true,
          inventory: {
            select: {
              trackInventory: true,
              stockOnHand: true,
              reserved: true,
            },
          },
        },
      },
    },
  },
  design: {
    select: { id: true, moderationStatus: true },
  },
  prices: true,
} as const;

const PAYOUT_CODE_TO_READINESS: Partial<
  Record<PayoutEligibilityCode, CampaignReadinessCode>
> = {
  [PayoutEligibilityCode.ORGANISER_NOT_ACTIVE]:
    CampaignReadinessCode.PAYOUT_ORGANISER_NOT_ACTIVE,
  [PayoutEligibilityCode.ORGANISER_ROLE_INVALID]:
    CampaignReadinessCode.PAYOUT_ORGANISER_ROLE_INVALID,
  [PayoutEligibilityCode.EMAIL_UNVERIFIED]:
    CampaignReadinessCode.PAYOUT_EMAIL_UNVERIFIED,
  [PayoutEligibilityCode.PHONE_MISSING]:
    CampaignReadinessCode.PAYOUT_PHONE_MISSING,
  [PayoutEligibilityCode.TERMS_NOT_CURRENT]:
    CampaignReadinessCode.PAYOUT_TERMS_NOT_CURRENT,
  [PayoutEligibilityCode.PROFILE_MISSING]:
    CampaignReadinessCode.PAYOUT_PROFILE_MISSING,
  [PayoutEligibilityCode.PROFILE_NOT_OWNED]:
    CampaignReadinessCode.PAYOUT_PROFILE_NOT_OWNED,
  [PayoutEligibilityCode.PROFILE_NOT_VERIFIED]:
    CampaignReadinessCode.PAYOUT_PROFILE_NOT_VERIFIED,
  [PayoutEligibilityCode.PROFILE_SUSPENDED]:
    CampaignReadinessCode.PAYOUT_PROFILE_SUSPENDED,
  [PayoutEligibilityCode.PROFILE_REJECTED]:
    CampaignReadinessCode.PAYOUT_PROFILE_REJECTED,
  [PayoutEligibilityCode.BANK_UNRESOLVED]:
    CampaignReadinessCode.PAYOUT_BANK_UNRESOLVED,
};

/**
 * Server-side campaign readiness authority (TTW-034 / TTW-042 payout gate).
 * Clients must never invent or trust readiness; always re-evaluate here.
 */
@Injectable()
export class CampaignReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  async evaluate(
    campaignId: string,
    phase: ReadinessPhase,
    now: Date = new Date(),
  ): Promise<CampaignReadinessResult> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        products: { include: OFFER_INCLUDE },
        payoutProfile: true,
        organizer: {
          select: {
            id: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
            phone: true,
            organizerApplications: {
              where: { status: OrganizerApplicationStatus.APPROVED },
              orderBy: { reviewedAt: 'desc' },
              take: 1,
              select: { termsVersion: true },
            },
            payoutProfiles: {
              where: { isDefault: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!campaign) {
      return {
        ...emptyReadinessResult(phase, 0, null),
        ready: false,
        blockers: [
          issue(
            CampaignReadinessCode.NO_OFFERS,
            'Campaign is not ready for this action',
          ),
        ],
      };
    }

    const result = emptyReadinessResult(
      phase,
      campaign.draftRevision,
      campaign.approvedRevision ?? null,
    );

    this.evaluateCopyAndDates(campaign, result, phase, now);
    await this.evaluateOffers(campaign, result, phase);
    this.evaluateOrganiser(campaign.organizer, result);
    this.evaluatePayoutEligibility(campaign, result, phase);

    if (
      phase === CampaignReadinessPhase.RESUME &&
      (campaign.approvedRevision == null ||
        campaign.approvedRevision !== campaign.draftRevision)
    ) {
      result.blockers.push(
        issue(
          CampaignReadinessCode.REVISION_MISMATCH,
          'Campaign content changed since it was last approved. Resubmit for review before resuming.',
        ),
      );
    }

    // Future start is allowed; surface as warning for organiser/admin UX.
    if (campaign.startDate && campaign.startDate.getTime() > now.getTime()) {
      result.warnings.push(
        issue(
          CampaignReadinessCode.SCHEDULED_START,
          'Campaign will remain non-public until its start date.',
        ),
      );
    }

    result.ready = result.blockers.length === 0;
    result.policyVersion = CAMPAIGN_READINESS_POLICY_VERSION;
    return result;
  }

  private evaluatePayoutEligibility(
    campaign: {
      organizer: {
        id: string;
        role: UserRole;
        status: UserStatus;
        emailVerifiedAt: Date | null;
        phone: string | null;
        organizerApplications: Array<{ termsVersion: string }>;
        payoutProfiles: Array<{
          id: string;
          userId: string;
          status: import('../generated/prisma/enums').PayoutProfileStatus;
          bankResolutionStatus: string | null;
          destinationVersion: number;
        }>;
      };
      payoutProfile: {
        id: string;
        userId: string;
        status: import('../generated/prisma/enums').PayoutProfileStatus;
        bankResolutionStatus: string | null;
        destinationVersion: number;
      } | null;
    },
    result: CampaignReadinessResult,
    phase: ReadinessPhase,
  ): void {
    const profile =
      campaign.payoutProfile ?? campaign.organizer.payoutProfiles?.[0] ?? null;
    const gate =
      phase === CampaignReadinessPhase.RESUME
        ? PayoutEligibilityGate.CAMPAIGN_RESUME
        : PayoutEligibilityGate.CAMPAIGN_ACTIVATE;
    const eligibility = evaluatePayoutEligibility({
      gate,
      organiser: {
        id: campaign.organizer.id,
        role: campaign.organizer.role,
        status: campaign.organizer.status,
        emailVerifiedAt: campaign.organizer.emailVerifiedAt,
        phone: campaign.organizer.phone,
        termsVersion:
          campaign.organizer.organizerApplications[0]?.termsVersion ?? null,
      },
      profile: profile ? toEligibilityProfile(profile) : null,
    });

    if (eligibility.eligible) return;

    const hardGate =
      phase === CampaignReadinessPhase.ACTIVATE ||
      phase === CampaignReadinessPhase.RESUME;

    for (const denial of eligibility.denials) {
      const readinessCode =
        PAYOUT_CODE_TO_READINESS[denial.code] ??
        CampaignReadinessCode.PAYOUT_PROFILE_MISSING;
      const item = issue(
        readinessCode,
        denial.message || messageForPayoutEligibilityCode(denial.code),
      );
      if (hardGate) {
        result.blockers.push(item);
      } else {
        result.warnings.push(item);
      }
    }
  }

  private evaluateCopyAndDates(
    campaign: {
      title: string;
      description: string | null;
      story: string | null;
      startDate: Date | null;
      endDate: Date | null;
    },
    result: CampaignReadinessResult,
    phase: ReadinessPhase,
    now: Date,
  ): void {
    if (!campaign.title?.trim()) {
      result.blockers.push(
        issue(
          CampaignReadinessCode.TITLE_MISSING,
          'Add a campaign title before continuing.',
        ),
      );
    }
    if (!campaign.description?.trim()) {
      result.blockers.push(
        issue(
          CampaignReadinessCode.DESCRIPTION_MISSING,
          'Add a short campaign description before continuing.',
        ),
      );
    }
    if (!campaign.story?.trim()) {
      result.blockers.push(
        issue(
          CampaignReadinessCode.STORY_MISSING,
          'Add a campaign story before continuing.',
        ),
      );
    }

    if (
      campaign.startDate &&
      campaign.endDate &&
      campaign.endDate.getTime() <= campaign.startDate.getTime()
    ) {
      result.blockers.push(
        issue(
          CampaignReadinessCode.DATE_ORDER_INVALID,
          'End date must be after start date.',
        ),
      );
    }

    if (
      phase === CampaignReadinessPhase.ACTIVATE ||
      phase === CampaignReadinessPhase.RESUME
    ) {
      if (!campaign.endDate || campaign.endDate.getTime() <= now.getTime()) {
        result.blockers.push(
          issue(
            CampaignReadinessCode.END_DATE_INVALID,
            'Set a future end date before activating or resuming.',
          ),
        );
      }
    }
  }

  private async evaluateOffers(
    campaign: {
      currency: string;
      products: Array<{
        id: string;
        productId: string;
        designId: string | null;
        product: {
          id: string;
          status: ProductStatus;
          variants: Array<{
            id: string;
            isAvailable: boolean;
            inventory: {
              trackInventory: boolean;
              stockOnHand: number;
              reserved: number;
            } | null;
          }>;
        };
        design: { id: string; moderationStatus: ModerationStatus } | null;
        prices: Array<{ currency: string; amount: unknown }>;
      }>;
    },
    result: CampaignReadinessResult,
    phase: ReadinessPhase,
  ): Promise<void> {
    if (campaign.products.length === 0) {
      result.blockers.push(
        issue(
          CampaignReadinessCode.NO_OFFERS,
          'Add at least one product offer with a design and price.',
        ),
      );
      return;
    }

    const currency = campaign.currency ?? DEFAULT_CURRENCY;
    const needsActivateGates =
      phase === CampaignReadinessPhase.ACTIVATE ||
      phase === CampaignReadinessPhase.RESUME;

    for (const cp of campaign.products) {
      if (!cp.designId || !cp.design) {
        result.blockers.push(
          issue(
            CampaignReadinessCode.OFFER_DESIGN_MISSING,
            'Every offer must include an owned design.',
            cp.id,
          ),
        );
        continue;
      }

      if (cp.design.moderationStatus === ModerationStatus.REJECTED) {
        result.blockers.push(
          issue(
            CampaignReadinessCode.DESIGN_REJECTED,
            'Replace or revise rejected designs before continuing.',
            cp.design.id,
          ),
        );
      }

      const priceRow =
        cp.prices.find((p) => p.currency === currency) ?? cp.prices[0];
      const amount = priceRow ? Number(priceRow.amount) : NaN;
      if (!Number.isFinite(amount) || amount <= 0) {
        result.blockers.push(
          issue(
            CampaignReadinessCode.OFFER_PRICE_INVALID,
            'Every offer needs a positive NGN selling price at or above the current platform minimum.',
            cp.id,
          ),
        );
      } else {
        try {
          const minimumPrice =
            await this.pricingService.getMinCampaignProductPrice(
              cp.productId,
              cp.designId,
              currency,
            );
          if (amount < minimumPrice) {
            result.blockers.push(
              issue(
                CampaignReadinessCode.OFFER_PRICE_INVALID,
                `Offer price must be at least ${minimumPrice} ${currency} (current platform minimum).`,
                cp.id,
              ),
            );
          }
        } catch {
          result.blockers.push(
            issue(
              CampaignReadinessCode.OFFER_PRICE_INVALID,
              'Every offer needs a positive NGN selling price at or above the current platform minimum.',
              cp.id,
            ),
          );
        }
      }

      if (!needsActivateGates) continue;

      if (cp.design.moderationStatus !== ModerationStatus.APPROVED) {
        result.blockers.push(
          issue(
            CampaignReadinessCode.DESIGN_NOT_APPROVED,
            'All attached designs must be approved before activation.',
            cp.design.id,
          ),
        );
      }

      if (cp.product.status !== ProductStatus.ACTIVE) {
        result.blockers.push(
          issue(
            CampaignReadinessCode.PRODUCT_INACTIVE,
            'All offered products must be active before activation.',
            cp.product.id,
          ),
        );
      }

      const hasSellable = cp.product.variants.some((v) => isVariantSellable(v));
      if (!hasSellable) {
        result.blockers.push(
          issue(
            CampaignReadinessCode.NO_AVAILABLE_VARIANT,
            'Each offer needs at least one available product variant.',
            cp.id,
          ),
        );
      }
    }
  }

  private evaluateOrganiser(
    organizer: {
      role: UserRole;
      status: UserStatus;
      organizerApplications: Array<{ termsVersion: string }>;
    },
    result: CampaignReadinessResult,
  ): void {
    if (
      organizer.role !== UserRole.ORGANIZER ||
      organizer.status !== UserStatus.ACTIVE
    ) {
      result.blockers.push(
        issue(
          CampaignReadinessCode.ORGANISER_INELIGIBLE,
          'Your organiser account must be active to submit or activate a campaign.',
        ),
      );
      return;
    }

    const latest = organizer.organizerApplications[0];
    if (!latest || latest.termsVersion !== ORGANIZER_TERMS_VERSION) {
      result.blockers.push(
        issue(
          CampaignReadinessCode.TERMS_NOT_CURRENT,
          'Accept the current organiser terms before submitting a campaign.',
        ),
      );
    }
  }
}
