import { Test, TestingModule } from '@nestjs/testing';
import { UserThrottlerGuard } from './user-throttler.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserAvatarService } from './user-avatar.service';
import { BadRequestException } from '@nestjs/common';
import { Readable } from 'node:stream';

const mockProfile = {
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  phone: null,
  role: 'CUSTOMER' as const,
  status: 'ACTIVE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<UsersService>;
  let avatars: {
    setAvatar: jest.Mock;
    removeAvatar: jest.Mock;
    openAvatar: jest.Mock;
  };

  beforeEach(async () => {
    const mockUsersService = {
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        {
          provide: UserAvatarService,
          useValue: (avatars = {
            setAvatar: jest.fn(),
            removeAvatar: jest.fn(),
            openAvatar: jest.fn(),
          }),
        },
      ],
    })
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile', () => {
    it('should return profile from usersService.getProfile', async () => {
      usersService.getProfile.mockResolvedValue(mockProfile as any);
      const user = { id: 'user-1' } as any;

      const result = await controller.getProfile(user);

      expect(usersService.getProfile).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockProfile);
    });
  });

  describe('updateProfile', () => {
    it('should return updated profile from usersService.updateProfile', async () => {
      const updated = { ...mockProfile, firstName: 'Updated' };
      usersService.updateProfile.mockResolvedValue(updated as any);
      const user = { id: 'user-1' } as any;
      const dto = { firstName: 'Updated' };

      const result = await controller.updateProfile(user, dto as any);

      expect(usersService.updateProfile).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('profile picture (TTW-263)', () => {
    const user = { id: 'user-1' } as any;

    it('stores the uploaded bytes for the caller only', async () => {
      avatars.setAvatar.mockResolvedValue({ avatarVersion: 'v1' });
      const file = { buffer: Buffer.from('img') } as Express.Multer.File;
      await expect(controller.uploadAvatar(user, file)).resolves.toEqual({
        avatarVersion: 'v1',
      });
      expect(avatars.setAvatar).toHaveBeenCalledWith('user-1', file.buffer);
    });

    it('answers 400 when no file is sent', async () => {
      await expect(
        controller.uploadAvatar(user, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(avatars.setAvatar).not.toHaveBeenCalled();
    });

    it("removes the caller's picture", async () => {
      await controller.removeAvatar(user);
      expect(avatars.removeAvatar).toHaveBeenCalledWith('user-1');
    });

    it("streams the caller's own picture as WebP and lets only that answer be cached", async () => {
      avatars.openAvatar.mockResolvedValue({
        stream: Readable.from([Buffer.from('x')]),
        contentType: 'image/webp',
        contentLength: 1,
      });
      const res = { setHeader: jest.fn() } as any;
      const file = await controller.getAvatar(user, res);
      expect(avatars.openAvatar).toHaveBeenCalledWith('user-1');
      expect(file.getHeaders().type).toBe('image/webp');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'private, max-age=86400',
      );
    });

    it('does not make an error answer cacheable', async () => {
      avatars.openAvatar.mockRejectedValue(new Error('no picture'));
      const res = { setHeader: jest.fn() } as any;
      await expect(controller.getAvatar(user, res)).rejects.toThrow();
      expect(res.setHeader).not.toHaveBeenCalled();
    });
  });
});
