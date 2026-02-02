import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

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

describe('UsersService', () => {
  let service: UsersService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProfile', () => {
    it('should return user profile when found', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockProfile);

      const result = await service.getProfile('user-1');

      expect(result).toEqual(mockProfile);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', status: { not: 'DELETED' } },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getProfile('unknown')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getProfile('unknown')).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('updateProfile', () => {
    it('should update and return user when found', async () => {
      const updated = { ...mockProfile, firstName: 'Updated' };
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockProfile);
      (prisma.user.update as jest.Mock).mockResolvedValue(updated);

      const dto = { firstName: 'Updated' };
      const result = await service.updateProfile('user-1', dto as any);

      expect(result).toEqual(updated);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: dto,
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateProfile('unknown', { firstName: 'X' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
