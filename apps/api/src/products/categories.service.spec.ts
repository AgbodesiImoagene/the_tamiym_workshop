import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const mockCategory = {
  id: 'cat-1',
  name: 'T-Shirts',
  slug: 't-shirts',
  description: 'Comfortable tees',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      category: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      product: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all categories', async () => {
      (prisma.category.findMany as jest.Mock).mockResolvedValue([mockCategory]);

      const result = await service.findAll();

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual([mockCategory]);
    });
  });

  describe('findOne', () => {
    it('should return a category by id', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue({
        ...mockCategory,
        products: [],
      });

      const result = await service.findOne('cat-1');

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        include: expect.any(Object),
      });
      expect(result.id).toBe('cat-1');
    });

    it('should throw NotFoundException when category not found', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a category with generated slug', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.category.create as jest.Mock).mockResolvedValue(mockCategory);

      const dto: CreateCategoryDto = { name: 'T-Shirts' };
      const result = await service.create(dto);

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: {
          name: 'T-Shirts',
          slug: 't-shirts',
          description: undefined,
        },
      });
      expect(result).toEqual(mockCategory);
    });

    it('should create a category with explicit slug', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.category.create as jest.Mock).mockResolvedValue(mockCategory);

      const dto: CreateCategoryDto = { name: 'T-Shirts', slug: 'tees' };
      await service.create(dto);

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: {
          name: 'T-Shirts',
          slug: 'tees',
          description: undefined,
        },
      });
    });

    it('should throw ConflictException when slug exists', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(mockCategory);

      const dto: CreateCategoryDto = { name: 'T-Shirts' };

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update a category', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(mockCategory);
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.category.update as jest.Mock).mockResolvedValue({
        ...mockCategory,
        name: 'Updated',
      });

      const dto: UpdateCategoryDto = { name: 'Updated' };
      const result = await service.update('cat-1', dto);

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: expect.objectContaining({ name: 'Updated' }),
      });
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException when category not found', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.update('invalid', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a category', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(mockCategory);
      (prisma.category.delete as jest.Mock).mockResolvedValue(mockCategory);

      const result = await service.remove('cat-1');

      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      });
      expect(result).toEqual(mockCategory);
    });

    it('should throw NotFoundException when category not found', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
