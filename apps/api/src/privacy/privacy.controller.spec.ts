import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { PrivacyRequestStatus } from '../generated/prisma/enums';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import type { Response } from 'express';

describe('PrivacyController', () => {
  let controller: PrivacyController;
  const privacy = {
    listForUser: jest.fn(),
    getForUser: jest.fn(),
    requestExport: jest.fn(),
    downloadExport: jest.fn(),
    requestErasure: jest.fn(),
    cancel: jest.fn(),
  };

  const user = { id: 'u1' } as RequestUser;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrivacyController],
      providers: [{ provide: PrivacyService, useValue: privacy }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PrivacyController);
  });

  it('lists requests for the current user', () => {
    privacy.listForUser.mockReturnValue([{ id: 'r1' }]);
    expect(controller.list(user)).toEqual([{ id: 'r1' }]);
    expect(privacy.listForUser).toHaveBeenCalledWith('u1');
  });

  it('gets one request', async () => {
    privacy.getForUser.mockResolvedValue({ id: 'r1' });
    await expect(controller.get(user, 'r1')).resolves.toEqual({ id: 'r1' });
  });

  it('requests an export', async () => {
    privacy.requestExport.mockResolvedValue({ id: 'e1' });
    await expect(
      controller.requestExport(user, { password: 'TestPassword1!' }),
    ).resolves.toEqual({ id: 'e1' });
  });

  it('downloads an export', async () => {
    privacy.downloadExport.mockResolvedValue({ checksum: 'abc' });
    await expect(
      controller.downloadExport(user, 'e1', { password: 'TestPassword1!' }),
    ).resolves.toEqual({ checksum: 'abc' });
  });

  it('clears auth cookies after completed erasure', async () => {
    privacy.requestErasure.mockResolvedValue({
      id: 'er1',
      status: PrivacyRequestStatus.COMPLETED,
    });
    const res = {
      cookie: jest.fn(),
    } as unknown as Response;
    const result = await controller.requestErasure(
      user,
      { password: 'TestPassword1!' },
      res,
    );
    expect(result.status).toBe(PrivacyRequestStatus.COMPLETED);
    expect(res.cookie).toHaveBeenCalled();
  });

  it('does not clear cookies when erasure is held', async () => {
    privacy.requestErasure.mockResolvedValue({
      id: 'er1',
      status: PrivacyRequestStatus.HELD,
    });
    const res = {
      cookie: jest.fn(),
    } as unknown as Response;
    await controller.requestErasure(user, { password: 'TestPassword1!' }, res);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('cancels a request', async () => {
    privacy.cancel.mockResolvedValue({ id: 'e1', status: 'CANCELLED' });
    await expect(controller.cancel(user, 'e1')).resolves.toMatchObject({
      status: 'CANCELLED',
    });
  });
});
