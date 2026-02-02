import { Test, TestingModule } from '@nestjs/testing';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

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

describe('AddressesController', () => {
  let controller: AddressesController;
  let addressesService: jest.Mocked<AddressesService>;

  beforeEach(async () => {
    const mockAddressesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AddressesController],
      providers: [
        { provide: AddressesService, useValue: mockAddressesService },
      ],
    }).compile();

    controller = module.get<AddressesController>(AddressesController);
    addressesService = module.get(AddressesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should return created address from service', async () => {
      addressesService.create.mockResolvedValue(mockAddress as any);
      const user = { id: 'user-1' } as any;
      const dto = {
        addressLine1: '123 Main St',
        city: 'Lagos',
        state: 'Lagos',
      };

      const result = await controller.create(user, dto as any);

      expect(addressesService.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(mockAddress);
    });
  });

  describe('findAll', () => {
    it('should return addresses from service', async () => {
      addressesService.findAll.mockResolvedValue([mockAddress] as any);
      const user = { id: 'user-1' } as any;

      const result = await controller.findAll(user);

      expect(addressesService.findAll).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([mockAddress]);
    });
  });

  describe('findUnique', () => {
    it('should return address from service', async () => {
      addressesService.findUnique.mockResolvedValue(mockAddress as any);
      const user = { id: 'user-1' } as any;

      const result = await controller.findUnique(user, 'addr-1');

      expect(addressesService.findUnique).toHaveBeenCalledWith(
        'user-1',
        'addr-1',
      );
      expect(result).toEqual(mockAddress);
    });
  });

  describe('update', () => {
    it('should return updated address from service', async () => {
      const updated = { ...mockAddress, addressLine1: '456 New St' };
      addressesService.update.mockResolvedValue(updated as any);
      const user = { id: 'user-1' } as any;
      const dto = { addressLine1: '456 New St' };

      const result = await controller.update(user, 'addr-1', dto as any);

      expect(addressesService.update).toHaveBeenCalledWith(
        'user-1',
        'addr-1',
        dto,
      );
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should call service.remove', async () => {
      addressesService.remove.mockResolvedValue(undefined as any);
      const user = { id: 'user-1' } as any;

      await controller.remove(user, 'addr-1');

      expect(addressesService.remove).toHaveBeenCalledWith('user-1', 'addr-1');
    });
  });
});
