import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AddressesService } from './addresses.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddressProvider } from '../generated/prisma/enums';
import { AddressNormalizationService } from '../shipping/address-normalization.service';

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
  countryCode: 'NG',
  landmark: null,
  instructions: null,
  locality: 'Lagos',
  dependentLocality: null,
  administrativeAreaLevel1: 'Lagos',
  administrativeAreaLevel2: null,
  stateCode: 'LA',
  lgaId: null,
  provider: AddressProvider.MANUAL,
  googlePlaceId: null,
  formattedAddress: null,
  latitude: null,
  longitude: null,
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
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };
    // TTW-219: writes run in a transaction; the callback gets the same mock.
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma),
    );
    const mockAddressNormalization = {
      normalizeForCreate: jest.fn().mockResolvedValue({
        addressLine1: '123 Main St',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        countryCode: 'NG',
      }),
      normalizeForUpdate: jest.fn().mockResolvedValue({
        addressLine1: '123 Main St',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        countryCode: 'NG',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressesService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: AddressNormalizationService,
          useValue: mockAddressNormalization,
        },
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

  describe('TTW-219: a refused save changes nothing', () => {
    it('create: no write and no transaction when normalisation refuses', async () => {
      const normalization = (service as any).addressNormalization;
      normalization.normalizeForCreate.mockRejectedValueOnce(
        new Error('refused'),
      );

      await expect(
        service.create('user-1', {
          addressLine1: 'x',
          city: 'x',
          state: 'Nowhere',
          isDefault: true,
        } as any),
      ).rejects.toThrow('refused');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.address.updateMany).not.toHaveBeenCalled();
      expect(prisma.address.create).not.toHaveBeenCalled();
    });

    it('update: no write and no transaction when normalisation refuses', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      const normalization = (service as any).addressNormalization;
      normalization.normalizeForUpdate.mockRejectedValueOnce(
        new Error('refused'),
      );

      await expect(
        service.update('user-1', 'addr-1', {
          isDefault: true,
          state: 'Nowhere',
        } as any),
      ).rejects.toThrow('refused');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.address.updateMany).not.toHaveBeenCalled();
      expect(prisma.address.update).not.toHaveBeenCalled();
    });

    it('create: the user lock is taken before the default is cleared', async () => {
      const order: string[] = [];
      (prisma.$executeRaw as unknown as jest.Mock).mockImplementation(() => {
        order.push('lock');
        return Promise.resolve(1);
      });
      (prisma.address.updateMany as jest.Mock).mockImplementation(() => {
        order.push('clear');
        return Promise.resolve({});
      });
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.address.create as jest.Mock).mockImplementation(() => {
        order.push('write');
        return Promise.resolve(mockAddress);
      });

      await service.create('user-1', {
        addressLine1: 'x',
        city: 'Lagos',
        state: 'Lagos',
        isDefault: true,
      } as any);

      expect(order).toEqual(['lock', 'clear', 'write']);
    });

    it('create: a failed write rejects (the transaction rolls the clear back)', async () => {
      (prisma.address.updateMany as jest.Mock).mockResolvedValue({});
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.address.create as jest.Mock).mockRejectedValue(
        new Error('db down'),
      );

      await expect(
        service.create('user-1', {
          addressLine1: 'x',
          city: 'Lagos',
          state: 'Lagos',
          isDefault: true,
        } as any),
      ).rejects.toThrow('db down');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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
      // TTW-222: the address is read again under the lock.
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.updateMany as jest.Mock).mockResolvedValue({});
      (prisma.address.update as jest.Mock).mockResolvedValue(updated);

      const dto = { addressLine1: '456 New St' };
      const result = await service.update('user-1', 'addr-1', dto as any);

      expect(result).toEqual(updated);
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
        data: expect.objectContaining({
          addressLine1: '123 Main St',
          city: 'Lagos',
          state: 'Lagos',
          country: 'Nigeria',
          countryCode: 'NG',
        }),
      });
    });

    it('TTW-222: throws NotFoundException and writes nothing when the address vanished before the lock', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('user-1', 'addr-1', {
          addressLine1: 'x',
          isDefault: true,
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.address.updateMany).not.toHaveBeenCalled();
      expect(prisma.address.update).not.toHaveBeenCalled();
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
      // TTW-222: the address is read again under the lock.
      (prisma.address.findFirst as jest.Mock).mockResolvedValue({
        ...mockAddress,
        isDefault: false,
      });
      (prisma.address.delete as jest.Mock).mockResolvedValue(mockAddress);

      await service.remove('user-1', 'addr-1');

      expect(prisma.address.delete).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
      });
      // the re-read under the lock says "not default", so nothing is promoted
      expect(prisma.address.update).not.toHaveBeenCalled();
    });

    it('should set new default when deleted address was default', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue({
        ...mockAddress,
        isDefault: true,
      });
      (prisma.address.delete as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.findFirst as jest.Mock)
        // re-read under the lock, then the most recent remaining address
        .mockResolvedValueOnce({ ...mockAddress, isDefault: true })
        .mockResolvedValueOnce({ id: 'addr-2', isDefault: false });
      (prisma.address.update as jest.Mock).mockResolvedValue({});

      await service.remove('user-1', 'addr-1');

      expect(prisma.address.findFirst).toHaveBeenLastCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-2' },
        data: { isDefault: true },
      });
    });

    it('TTW-227: answers 409 ADDRESS_IN_USE when an order uses the address (foreign key P2003)', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.findFirst as jest.Mock).mockResolvedValue({
        ...mockAddress,
        isDefault: true,
      });
      (prisma.address.delete as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('FK', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      );

      const error = await service
        .remove('user-1', 'addr-1')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        statusCode: 409,
        code: 'ADDRESS_IN_USE',
        message: 'This address is used by an order and cannot be deleted.',
      });
      // refused: nothing is promoted
      expect(prisma.address.update).not.toHaveBeenCalled();
    });

    it('TTW-227: any other database error is not turned into a 409', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.findFirst as jest.Mock).mockResolvedValue({
        ...mockAddress,
        isDefault: false,
      });
      const boom = new Error('connection lost');
      (prisma.address.delete as jest.Mock).mockRejectedValue(boom);

      await expect(service.remove('user-1', 'addr-1')).rejects.toBe(boom);
    });

    it('TTW-222: throws NotFoundException and deletes nothing when the address vanished before the lock', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('user-1', 'addr-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.address.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when address not found', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('user-1', 'unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
