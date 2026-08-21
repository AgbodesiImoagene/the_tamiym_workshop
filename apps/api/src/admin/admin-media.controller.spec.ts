import { Test, TestingModule } from '@nestjs/testing';
import { AdminMediaController } from './admin-media.controller';
import { MediaService } from '../media/media.service';
import { ModerationStatus } from '../generated/prisma/enums';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';

describe('AdminMediaController', () => {
  let controller: AdminMediaController;
  const mediaService = {
    adminFindAll: jest.fn(),
    adminFindOne: jest.fn(),
    adminUpdateModeration: jest.fn(),
  };
  const admin = { id: 'admin-1' } as RequestUser;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminMediaController],
      providers: [{ provide: MediaService, useValue: mediaService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AdminMediaController);
  });

  it('lists assets by moderation status', async () => {
    mediaService.adminFindAll.mockResolvedValue([{ id: 'm1' }]);
    await expect(controller.findAll(ModerationStatus.FLAGGED)).resolves.toEqual(
      [{ id: 'm1' }],
    );
  });

  it('gets one asset', async () => {
    mediaService.adminFindOne.mockResolvedValue({ id: 'm1' });
    await expect(controller.findOne('m1')).resolves.toEqual({ id: 'm1' });
  });

  it('updates moderation with actor id', async () => {
    mediaService.adminUpdateModeration.mockResolvedValue({ id: 'm1' });
    await expect(
      controller.updateModeration(admin, 'm1', {
        status: ModerationStatus.APPROVED,
        notes: 'ok',
      }),
    ).resolves.toEqual({ id: 'm1' });
    expect(mediaService.adminUpdateModeration).toHaveBeenCalledWith(
      'm1',
      ModerationStatus.APPROVED,
      'ok',
      'admin-1',
    );
  });
});
