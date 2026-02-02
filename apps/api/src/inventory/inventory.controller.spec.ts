import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

const mockInventoryResponse = {
  variantId: 'var-1',
  variantName: 'Small / Red',
  sku: 'SKU-S-RED',
  isAvailable: true,
  product: { id: 'prod-1', name: 'Tee', slug: 'tee' },
  inventory: {
    stockOnHand: 50,
    reserved: 2,
    trackInventory: true,
    lowStockThreshold: 10,
  },
};

describe('InventoryController', () => {
  let controller: InventoryController;
  let inventoryService: jest.Mocked<InventoryService>;

  beforeEach(async () => {
    const mockInventoryService = {
      getByVariantId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        { provide: InventoryService, useValue: mockInventoryService },
      ],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
    inventoryService = module.get(InventoryService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getByVariantId', () => {
    it('should return inventory for variant', async () => {
      inventoryService.getByVariantId.mockResolvedValue(
        mockInventoryResponse as never,
      );

      const result = await controller.getByVariantId('var-1');

      expect(inventoryService.getByVariantId).toHaveBeenCalledWith('var-1');
      expect(result).toEqual(mockInventoryResponse);
    });
  });
});
