import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDesignDto } from './dto/create-design.dto';
import { UpdateDesignDto } from './dto/update-design.dto';
import { ModerationStatus } from '../generated/prisma/enums';

@Injectable()
export class DesignsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validate designData is a non-null object (optional: version, views)
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
    return true;
  }

  /**
   * Create a design (customer, own designs)
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
    return this.prisma.design.create({
      data: {
        userId,
        productId: dto.productId,
        name: dto.name,
        designData: dto.designData as object,
        thumbnailUrl: dto.thumbnailUrl,
        moderationStatus: ModerationStatus.PENDING,
      },
      include: {
        product: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  /**
   * List designs for current user (customer)
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
   * Get a single design by ID (customer, own only)
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
   * Update a design (customer, own only)
   */
  async update(userId: string, id: string, dto: UpdateDesignDto) {
    await this.findOne(userId, id);
    if (
      dto.designData !== undefined &&
      !this.validateDesignData(dto.designData)
    ) {
      throw new BadRequestException('designData must be a valid object');
    }
    return this.prisma.design.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.designData !== undefined && {
          designData: dto.designData as object,
        }),
        ...(dto.thumbnailUrl !== undefined && {
          thumbnailUrl: dto.thumbnailUrl,
        }),
      },
      include: {
        product: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  /**
   * Delete a design (customer, own only)
   */
  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.design.delete({
      where: { id },
    });
  }

  /**
   * List designs by moderation status (admin)
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
   * Update moderation status (admin)
   */
  async updateModeration(id: string, status: ModerationStatus) {
    const design = await this.prisma.design.findUnique({
      where: { id },
    });
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
    return this.prisma.design.update({
      where: { id },
      data: { moderationStatus: status },
      include: {
        user: { select: { id: true, email: true } },
        product: { select: { id: true, name: true, slug: true } },
      },
    });
  }
}
