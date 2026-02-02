import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { PrismaService } from '../prisma/prisma.service';

const mockAddress = {
  id: 'addr-1',
  userId: 'user-1',
  addressLine1: '123 Main St',
  addressLine2: null,
  recipientName: null,
  phone: null,
  city: 'Lagos',
  state: 'Lagos',
  postalCode: null,
  country: 'Nigeria',
  landmark: null,
  instructions: null,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AddressesService', () => {
  let service: AddressesService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      address: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AddressesService>(AddressesService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create address and return it', async () => {
      (prisma.address.updateMany as jest.Mock).mockResolvedValue({});
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.address.create as jest.Mock).mockResolvedValue(mockAddress);

      const dto = {
        addressLine1: '123 Main St',
        city: 'Lagos',
        state: 'Lagos',
      };

      const result = await service.create('user-1', dto as any);

      expect(result).toEqual(mockAddress);
      expect(prisma.address.create).toHaveBeenCalled();
    });

    it('should unset other defaults when isDefault is true', async () => {
      (prisma.address.updateMany as jest.Mock).mockResolvedValue({});
      (prisma.address.findFirst as jest.Mock).mockResolvedValue({
        id: 'other',
        isDefault: true,
      });
      (prisma.address.create as jest.Mock).mockResolvedValue(mockAddress);

      await service.create('user-1', {
        addressLine1: '123 Main St',
        city: 'Lagos',
        state: 'Lagos',
        isDefault: true,
      } as any);

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  describe('findAll', () => {
    it('should return addresses for user', async () => {
      (prisma.address.findMany as jest.Mock).mockResolvedValue([mockAddress]);

      const result = await service.findAll('user-1');

      expect(result).toEqual([mockAddress]);
      expect(prisma.address.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
    });
  });

  describe('findUnique', () => {
    it('should return address when found and belongs to user', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);

      const result = await service.findUnique('user-1', 'addr-1');

      expect(result).toEqual(mockAddress);
    });

    it('should throw NotFoundException when address not found', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findUnique('user-1', 'unknown')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findUnique('user-1', 'unknown')).rejects.toThrow(
        'Address not found',
      );
    });

    it('should throw ForbiddenException when address belongs to another user', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue({
        ...mockAddress,
        userId: 'other-user',
      });

      await expect(service.findUnique('user-1', 'addr-1')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.findUnique('user-1', 'addr-1')).rejects.toThrow(
        'Access denied',
      );
    });
  });

  describe('update', () => {
    it('should update and return address when found and owned by user', async () => {
      const updated = { ...mockAddress, addressLine1: '456 New St' };
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.updateMany as jest.Mock).mockResolvedValue({});
      (prisma.address.update as jest.Mock).mockResolvedValue(updated);

      const dto = { addressLine1: '456 New St' };
      const result = await service.update('user-1', 'addr-1', dto as any);

      expect(result).toEqual(updated);
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
        data: dto,
      });
    });

    it('should throw NotFoundException when address not found', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('user-1', 'unknown', { addressLine1: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when address belongs to another user', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue({
        ...mockAddress,
        userId: 'other-user',
      });

      await expect(
        service.update('user-1', 'addr-1', { addressLine1: 'x' } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete address when found and owned by user', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.delete as jest.Mock).mockResolvedValue(mockAddress);

      await service.remove('user-1', 'addr-1');

      expect(prisma.address.delete).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
      });
    });

    it('should set new default when deleted address was default', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue({
        ...mockAddress,
        isDefault: true,
      });
      (prisma.address.delete as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.findFirst as jest.Mock).mockResolvedValue({
        id: 'addr-2',
        isDefault: false,
      });
      (prisma.address.update as jest.Mock).mockResolvedValue({});

      await service.remove('user-1', 'addr-1');

      expect(prisma.address.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-2' },
        data: { isDefault: true },
      });
    });

    it('should throw NotFoundException when address not found', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('user-1', 'unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
