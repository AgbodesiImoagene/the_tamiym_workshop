import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DesignsService } from './designs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDesignDto } from './dto/create-design.dto';
import { UpdateDesignDto } from './dto/update-design.dto';
import { ModerationStatus } from '../generated/prisma/enums';

const mockDesign = {
  id: 'design-1',
  userId: 'user-1',
  productId: 'prod-1',
  campaignId: null,
  name: 'My Design',
  designData: { version: 1, views: {} },
  thumbnailUrl: null,
  moderationStatus: ModerationStatus.PENDING,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('DesignsService', () => {
  let service: DesignsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      design: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DesignsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DesignsService>(DesignsService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a design', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
      });
      (prisma.design.create as jest.Mock).mockResolvedValue(mockDesign);

      const dto: CreateDesignDto = {
        name: 'My Design',
        productId: 'prod-1',
        designData: { version: 1, views: {} },
      };
      const result = await service.create('user-1', dto);

      expect(prisma.design.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          productId: 'prod-1',
          name: 'My Design',
          designData: { version: 1, views: {} },
          moderationStatus: ModerationStatus.PENDING,
        }),
        include: expect.any(Object),
      });
      expect(result).toEqual(mockDesign);
    });

    it('should throw BadRequestException when designData is not object', async () => {
      const dto: CreateDesignDto = {
        name: 'My Design',
        productId: 'prod-1',
        designData: null as unknown as Record<string, unknown>,
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when product not found', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      const dto: CreateDesignDto = {
        name: 'My Design',
        productId: 'invalid',
        designData: { version: 1 },
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return designs for user', async () => {
      (prisma.design.findMany as jest.Mock).mockResolvedValue([mockDesign]);

      const result = await service.findAll('user-1');

      expect(prisma.design.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { updatedAt: 'desc' },
        include: expect.any(Object),
      });
      expect(result).toEqual([mockDesign]);
    });
  });

  describe('findOne', () => {
    it('should return design when user owns it', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);

      const result = await service.findOne('user-1', 'design-1');

      expect(result).toEqual(mockDesign);
    });

    it('should throw NotFoundException when design not found', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('user-1', 'invalid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user does not own design', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);

      await expect(service.findOne('other-user', 'design-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('should update design when user owns it', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.design.update as jest.Mock).mockResolvedValue({
        ...mockDesign,
        name: 'Updated',
      });

      const dto: UpdateDesignDto = { name: 'Updated' };
      const result = await service.update('user-1', 'design-1', dto);

      expect(prisma.design.update).toHaveBeenCalledWith({
        where: { id: 'design-1' },
        data: expect.objectContaining({ name: 'Updated' }),
        include: expect.any(Object),
      });
      expect(result.name).toBe('Updated');
    });

    it('should throw BadRequestException when designData is invalid', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);

      await expect(
        service.update('user-1', 'design-1', {
          designData: 'invalid' as unknown as Record<string, unknown>,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should delete design when user owns it', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.design.delete as jest.Mock).mockResolvedValue(mockDesign);

      await service.remove('user-1', 'design-1');

      expect(prisma.design.delete).toHaveBeenCalledWith({
        where: { id: 'design-1' },
      });
    });
  });

  describe('findAllByModerationStatus', () => {
    it('should return designs filtered by status', async () => {
      (prisma.design.findMany as jest.Mock).mockResolvedValue([mockDesign]);

      const result = await service.findAllByModerationStatus(
        ModerationStatus.PENDING,
      );

      expect(prisma.design.findMany).toHaveBeenCalledWith({
        where: { moderationStatus: ModerationStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        include: expect.any(Object),
      });
      expect(result).toEqual([mockDesign]);
    });

    it('should return all designs when status not provided', async () => {
      (prisma.design.findMany as jest.Mock).mockResolvedValue([mockDesign]);

      await service.findAllByModerationStatus();

      expect(prisma.design.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        include: expect.any(Object),
      });
    });
  });

  describe('updateModeration', () => {
    it('should update moderation status', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.design.update as jest.Mock).mockResolvedValue({
        ...mockDesign,
        moderationStatus: ModerationStatus.APPROVED,
      });

      const result = await service.updateModeration(
        'design-1',
        ModerationStatus.APPROVED,
      );

      expect(prisma.design.update).toHaveBeenCalledWith({
        where: { id: 'design-1' },
        data: { moderationStatus: ModerationStatus.APPROVED },
        include: expect.any(Object),
      });
      expect(result.moderationStatus).toBe(ModerationStatus.APPROVED);
    });

    it('should throw NotFoundException when design not found', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateModeration('invalid', ModerationStatus.APPROVED),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when status is PENDING', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);

      await expect(
        service.updateModeration('design-1', ModerationStatus.PENDING),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
