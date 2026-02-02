import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { AddCampaignProductDto } from './dto/add-campaign-product.dto';
import { CampaignStatus, CurrencyCode } from '../generated/prisma/enums';

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) {}

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '');
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
    return this.prisma.campaign.create({
      data: {
        organizerId,
        title: dto.title,
        slug,
        description: dto.description,
        story: dto.story,
        status: CampaignStatus.DRAFT,
        currency: CurrencyCode.NGN,
        goalAmount: dto.goalAmount,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
  }

  /**
   * List campaigns for organizer
   */
  async findAll(organizerId: string) {
    return this.prisma.campaign.findMany({
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
    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(slug && { slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.story !== undefined && { story: dto.story }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.goalAmount !== undefined && { goalAmount: dto.goalAmount }),
        ...(dto.startDate !== undefined && {
          startDate: dto.startDate ? new Date(dto.startDate) : null,
        }),
        ...(dto.endDate !== undefined && {
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        }),
      },
    });
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
      await this.prisma.campaignProductPrice.create({
        data: {
          campaignProductId: cp.id,
          currency: CurrencyCode.NGN,
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
   * Get campaign by slug (public, read-only). Performance snapshot: currentAmount, goalAmount, etc.
   */
  async getBySlug(slug: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug, status: CampaignStatus.ACTIVE },
      include: {
        organizer: {
          select: { id: true, firstName: true, lastName: true },
        },
        products: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                description: true,
              },
            },
            design: { select: { id: true, name: true, thumbnailUrl: true } },
            prices: { where: { currency: CurrencyCode.NGN } },
          },
        },
      },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return {
      ...campaign,
      performance: {
        currentAmount: Number(campaign.currentAmount),
        goalAmount: campaign.goalAmount ? Number(campaign.goalAmount) : null,
        currency: campaign.currency,
      },
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
          include: { product: { select: { id: true, name: true } } },
        },
      },
    });
  }

  /**
   * Update campaign status (admin). E.g. disable campaign.
   */
  async updateStatusForAdmin(id: string, status: CampaignStatus) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return this.prisma.campaign.update({
      where: { id },
      data: { status },
    });
  }
}
