import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PublicDesignsController } from './public-designs.controller';
import { DesignsService } from './designs.service';

describe('PublicDesignsController', () => {
  let controller: PublicDesignsController;
  const designsService = { findByShareToken: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicDesignsController],
      providers: [{ provide: DesignsService, useValue: designsService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PublicDesignsController);
  });

  it('delegates public lookup', async () => {
    designsService.findByShareToken.mockResolvedValue({ id: 'd1' });
    await expect(controller.findByShareToken('tok')).resolves.toEqual({
      id: 'd1',
    });
  });
});
