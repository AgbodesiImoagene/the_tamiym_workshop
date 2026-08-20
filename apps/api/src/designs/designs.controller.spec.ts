import { Test, TestingModule } from '@nestjs/testing';
import { DesignsController } from './designs.controller';
import { DesignsService } from './designs.service';
import { ModerationStatus } from '../generated/prisma/enums';

const mockDesign = {
  id: 'design-1',
  userId: 'user-1',
  productId: 'prod-1',
  name: 'My Design',
  designData: { version: 1, views: {} },
  moderationStatus: ModerationStatus.PENDING,
  product: { id: 'prod-1', name: 'Tee', slug: 'tee' },
};

describe('DesignsController', () => {
  let controller: DesignsController;
  let designsService: jest.Mocked<DesignsService>;

  beforeEach(async () => {
    const mockDesignsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      createShareLink: jest.fn(),
      listShareLinks: jest.fn(),
      revokeShareLink: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DesignsController],
      providers: [{ provide: DesignsService, useValue: mockDesignsService }],
    }).compile();

    controller = module.get<DesignsController>(DesignsController);
    designsService = module.get(DesignsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a design', async () => {
      designsService.create.mockResolvedValue(mockDesign as never);
      const user = { id: 'user-1' } as never;
      const dto = {
        name: 'My Design',
        productId: 'prod-1',
        designData: { version: 1, views: {} },
      };

      const result = await controller.create(user, dto as never);

      expect(designsService.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(mockDesign);
    });
  });

  describe('findAll', () => {
    it('should return list of designs', async () => {
      designsService.findAll.mockResolvedValue([mockDesign] as never);
      const user = { id: 'user-1' } as never;

      const result = await controller.findAll(user);

      expect(designsService.findAll).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([mockDesign]);
    });
  });

  describe('findOne', () => {
    it('should return design by id', async () => {
      designsService.findOne.mockResolvedValue(mockDesign as never);
      const user = { id: 'user-1' } as never;

      const result = await controller.findOne(user, 'design-1');

      expect(designsService.findOne).toHaveBeenCalledWith('user-1', 'design-1');
      expect(result).toEqual(mockDesign);
    });
  });

  describe('update', () => {
    it('should update design', async () => {
      designsService.update.mockResolvedValue({
        ...mockDesign,
        name: 'Updated',
      } as never);
      const user = { id: 'user-1' } as never;
      const dto = { name: 'Updated' };

      const result = await controller.update(user, 'design-1', dto as never);

      expect(designsService.update).toHaveBeenCalledWith(
        'user-1',
        'design-1',
        dto,
      );
      expect(result.name).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should delete design', async () => {
      designsService.remove.mockResolvedValue(undefined as never);
      const user = { id: 'user-1' } as never;

      await controller.remove(user, 'design-1');

      expect(designsService.remove).toHaveBeenCalledWith('user-1', 'design-1');
    });
  });

  describe('share lifecycle', () => {
    it('creates a share link', async () => {
      designsService.createShareLink.mockResolvedValue({
        id: 'link-1',
        shareToken: 'tok',
        shareUrl: 'https://app.example.com/design/shared/tok',
      } as never);
      const user = { id: 'user-1' } as never;
      await controller.share(user, 'design-1', { ttlDays: 7 });
      expect(designsService.createShareLink).toHaveBeenCalledWith(
        'user-1',
        'design-1',
        7,
      );
    });

    it('lists share links', async () => {
      designsService.listShareLinks.mockResolvedValue([] as never);
      const user = { id: 'user-1' } as never;
      await controller.listShareLinks(user, 'design-1');
      expect(designsService.listShareLinks).toHaveBeenCalledWith(
        'user-1',
        'design-1',
      );
    });

    it('revokes a share link', async () => {
      designsService.revokeShareLink.mockResolvedValue({
        id: 'link-1',
        revokedAt: new Date(),
      } as never);
      const user = { id: 'user-1' } as never;
      await controller.revokeShareLink(user, 'design-1', 'link-1');
      expect(designsService.revokeShareLink).toHaveBeenCalledWith(
        'user-1',
        'design-1',
        'link-1',
      );
    });
  });
});
