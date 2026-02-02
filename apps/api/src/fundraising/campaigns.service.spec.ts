import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CampaignStatus } from '../generated/prisma/enums';

const mockCampaign = {
  id: 'camp-1',
  organizerId: 'user-1',
  title: 'School Fundraiser',
  slug: 'school-fundraiser',
  description: null,
  story: null,
  status: CampaignStatus.DRAFT,
  currency: 'NGN',
  goalAmount: 500000,
  currentAmount: 0,
  startDate: null,
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CampaignsService', () => {
  let service: CampaignsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      campaign: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      product: { findUnique: jest.fn() },
      design: { findUnique: jest.fn() },
      campaignProduct: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      campaignProductPrice: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a campaign', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.campaign.create as jest.Mock).mockResolvedValue(mockCampaign);

      const dto: CreateCampaignDto = { title: 'School Fundraiser' };
      const result = await service.create('user-1', dto);

      expect(prisma.campaign.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizerId: 'user-1',
          title: 'School Fundraiser',
          slug: 'school-fundraiser',
          status: CampaignStatus.DRAFT,
        }),
      });
      expect(result).toEqual(mockCampaign);
    });

    it('should throw ConflictException when slug exists', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(mockCampaign);

      const dto: CreateCampaignDto = { title: 'School Fundraiser' };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    it('should return campaign when organizer owns it', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(mockCampaign);

      const result = await service.findOne('user-1', 'camp-1');

      expect(result).toEqual(mockCampaign);
    });

    it('should throw NotFoundException when campaign not found', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('user-1', 'invalid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user does not own campaign', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(mockCampaign);

      await expect(service.findOne('other-user', 'camp-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getBySlug', () => {
    it('should return active campaign by slug', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ACTIVE,
        organizer: {},
        products: [],
      });

      const result = await service.getBySlug('school-fundraiser');

      expect(prisma.campaign.findUnique).toHaveBeenCalledWith({
        where: { slug: 'school-fundraiser', status: CampaignStatus.ACTIVE },
        include: expect.any(Object),
      });
      expect(result.performance).toBeDefined();
      expect(result.performance.currentAmount).toBe(0);
    });

    it('should throw NotFoundException when campaign not found', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getBySlug('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateStatusForAdmin', () => {
    it('should update campaign status', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(mockCampaign);
      (prisma.campaign.update as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.DISABLED,
      });

      const result = await service.updateStatusForAdmin(
        'camp-1',
        CampaignStatus.DISABLED,
      );

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: { status: CampaignStatus.DISABLED },
      });
      expect(result.status).toBe(CampaignStatus.DISABLED);
    });
  });
});
