import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

const mockCategory = {
  id: 'cat-1',
  name: 'T-Shirts',
  slug: 't-shirts',
  description: 'Comfortable tees',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let categoriesService: jest.Mocked<CategoriesService>;

  beforeEach(async () => {
    const mockCategoriesService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        { provide: CategoriesService, useValue: mockCategoriesService },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
    categoriesService = module.get(CategoriesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return list of categories', async () => {
      categoriesService.findAll.mockResolvedValue([mockCategory] as never);

      const result = await controller.findAll();

      expect(categoriesService.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockCategory]);
    });
  });

  describe('findOne', () => {
    it('should return a category by id', async () => {
      categoriesService.findOne.mockResolvedValue(mockCategory as never);

      const result = await controller.findOne('cat-1');

      expect(categoriesService.findOne).toHaveBeenCalledWith('cat-1');
      expect(result).toEqual(mockCategory);
    });
  });
});
