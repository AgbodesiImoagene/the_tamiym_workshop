import { Test, TestingModule } from '@nestjs/testing';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { OrdersService } from '../orders/orders.service';
import { PricingService } from '../pricing/pricing.service';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { CampaignStatus } from '../generated/prisma/enums';

const mockCampaign = {
  id: 'camp-1',
  organizerId: 'user-1',
  title: 'School Fundraiser',
  slug: 'school-fundraiser',
  status: CampaignStatus.DRAFT,
};

describe('CampaignsController', () => {
  let controller: CampaignsController;
  let campaignsService: jest.Mocked<CampaignsService>;

  beforeEach(async () => {
    const mockCampaignsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      addProduct: jest.fn(),
      addOffer: jest.fn(),
      updateOffer: jest.fn(),
      removeOffer: jest.fn(),
      getOwnerDraftPreview: jest.fn(),
      getPriceGuidance: jest.fn(),
      submitForReview: jest.fn(),
    };
    const mockOrdersService = {
      findOrdersByCampaignForOrganizer: jest.fn(),
    };
    const mockPricingService = {
      quoteCampaign: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampaignsController],
      providers: [
        { provide: CampaignsService, useValue: mockCampaignsService },
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: PricingService, useValue: mockPricingService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CampaignsController>(CampaignsController);
    campaignsService = module.get(CampaignsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a campaign', async () => {
      campaignsService.create.mockResolvedValue(mockCampaign as never);
      const user = { id: 'user-1' } as never;
      const dto = { title: 'School Fundraiser' };

      const result = await controller.create(user, dto as never);

      expect(campaignsService.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(mockCampaign);
    });
  });

  describe('findAll', () => {
    it('should return list of campaigns', async () => {
      campaignsService.findAll.mockResolvedValue([mockCampaign] as never);
      const user = { id: 'user-1' } as never;

      const result = await controller.findAll(user);

      expect(campaignsService.findAll).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([mockCampaign]);
    });
  });

  describe('findOne', () => {
    it('should return campaign by id', async () => {
      campaignsService.findOne.mockResolvedValue(mockCampaign as never);
      const user = { id: 'user-1' } as never;

      const result = await controller.findOne(user, 'camp-1');

      expect(campaignsService.findOne).toHaveBeenCalledWith('user-1', 'camp-1');
      expect(result).toEqual(mockCampaign);
    });
  });

  describe('addProduct', () => {
    it('should add product to campaign', async () => {
      const cp = { id: 'cp-1', productId: 'prod-1', campaignId: 'camp-1' };
      campaignsService.addProduct.mockResolvedValue(cp as never);
      const user = { id: 'user-1' } as never;
      const dto = { productId: 'prod-1' };

      const result = await controller.addProduct(user, 'camp-1', dto as never);

      expect(campaignsService.addProduct).toHaveBeenCalledWith(
        'camp-1',
        'user-1',
        dto,
      );
      expect(result).toEqual(cp);
    });
  });

  describe('authoring endpoints', () => {
    const user = { id: 'user-1' } as never;

    it('preview delegates to getOwnerDraftPreview', async () => {
      campaignsService.getOwnerDraftPreview.mockResolvedValue({
        purchasable: false,
      } as never);
      await controller.preview(user, 'camp-1');
      expect(campaignsService.getOwnerDraftPreview).toHaveBeenCalledWith(
        'user-1',
        'camp-1',
      );
    });

    it('priceGuidance delegates', async () => {
      campaignsService.getPriceGuidance.mockResolvedValue({
        minimumPrice: 1,
      } as never);
      await controller.priceGuidance(user, 'camp-1', 'prod-1', 'design-1');
      expect(campaignsService.getPriceGuidance).toHaveBeenCalledWith(
        'user-1',
        'camp-1',
        'prod-1',
        'design-1',
      );
    });

    it('update / addOffer / updateOffer / removeOffer / submitForReview', async () => {
      campaignsService.update.mockResolvedValue(mockCampaign as never);
      campaignsService.addOffer.mockResolvedValue(mockCampaign as never);
      campaignsService.updateOffer.mockResolvedValue(mockCampaign as never);
      campaignsService.removeOffer.mockResolvedValue(mockCampaign as never);
      campaignsService.submitForReview.mockResolvedValue(mockCampaign as never);

      await controller.update(user, 'camp-1', {
        expectedRevision: 1,
        title: 'x',
      } as never);
      await controller.addOffer(user, 'camp-1', {
        expectedRevision: 1,
        productId: 'p',
        designId: 'd',
        price: 10,
      } as never);
      await controller.updateOffer(user, 'camp-1', 'cp-1', {
        expectedRevision: 1,
        price: 11,
      } as never);
      await controller.removeOffer(user, 'camp-1', 'cp-1', {
        expectedRevision: 1,
      } as never);
      await controller.submitForReview(user, 'camp-1');

      expect(campaignsService.update).toHaveBeenCalled();
      expect(campaignsService.addOffer).toHaveBeenCalled();
      expect(campaignsService.updateOffer).toHaveBeenCalled();
      expect(campaignsService.removeOffer).toHaveBeenCalled();
      expect(campaignsService.submitForReview).toHaveBeenCalledWith(
        'camp-1',
        'user-1',
      );
    });
  });
});
