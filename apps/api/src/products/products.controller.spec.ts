import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductStatus } from '../generated/prisma/enums';

const mockProduct = {
  id: 'prod-1',
  categoryId: 'cat-1',
  name: 'Classic Tee',
  slug: 'classic-tee',
  description: 'Soft cotton',
  status: ProductStatus.ACTIVE,
  category: { id: 'cat-1', name: 'T-Shirts', slug: 't-shirts' },
  variants: [],
  prices: [],
};

describe('ProductsController', () => {
  let controller: ProductsController;
  let productsService: jest.Mocked<ProductsService>;

  beforeEach(async () => {
    const mockProductsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: mockProductsService }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
    productsService = module.get(ProductsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return list of products', async () => {
      productsService.findAll.mockResolvedValue([mockProduct] as never);

      const result = await controller.findAll({});

      expect(productsService.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockProduct]);
    });

    it('should pass query params to service', async () => {
      productsService.findAll.mockResolvedValue([] as never);

      await controller.findAll({ categoryId: 'cat-1', available: true });

      expect(productsService.findAll).toHaveBeenCalledWith({
        categoryId: 'cat-1',
        available: true,
      });
    });
  });

  describe('findOne', () => {
    it('should return a product by id', async () => {
      productsService.findOne.mockResolvedValue(mockProduct as never);

      const result = await controller.findOne('prod-1');

      expect(productsService.findOne).toHaveBeenCalledWith('prod-1');
      expect(result).toEqual(mockProduct);
    });
  });
});
