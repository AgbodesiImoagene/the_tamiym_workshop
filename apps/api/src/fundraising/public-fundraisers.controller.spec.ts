import { Test, TestingModule } from '@nestjs/testing';
import { PublicFundraisersController } from './public-fundraisers.controller';
import { CampaignsService } from './campaigns.service';

describe('PublicFundraisersController', () => {
  let controller: PublicFundraisersController;
  let campaignsService: {
    getBySlug: jest.Mock;
    listPublicIndexableSlugs: jest.Mock;
  };

  beforeEach(async () => {
    campaignsService = {
      getBySlug: jest.fn(),
      listPublicIndexableSlugs: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicFundraisersController],
      providers: [{ provide: CampaignsService, useValue: campaignsService }],
    }).compile();

    controller = module.get(PublicFundraisersController);
  });

  it('delegates getBySlug to CampaignsService', async () => {
    const payload = {
      id: 'camp-1',
      slug: 'school-fundraiser',
      products: [],
      offerPolicyVersion: 'public-campaign-offer/v1-interim-2026-08-21',
    };
    campaignsService.getBySlug.mockResolvedValue(payload);

    await expect(controller.getBySlug('school-fundraiser')).resolves.toEqual(
      payload,
    );
    expect(campaignsService.getBySlug).toHaveBeenCalledWith(
      'school-fundraiser',
    );
  });

  it('delegates listIndexable to CampaignsService', async () => {
    const items = [
      { slug: 'school-fundraiser', updatedAt: '2026-08-22T00:00:00.000Z' },
    ];
    campaignsService.listPublicIndexableSlugs.mockResolvedValue(items);

    await expect(controller.listIndexable()).resolves.toEqual({ items });
    expect(campaignsService.listPublicIndexableSlugs).toHaveBeenCalled();
  });
});
