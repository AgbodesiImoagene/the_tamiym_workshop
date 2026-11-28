import { Test, TestingModule } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ProductLikesController } from './product-likes.controller';
import { ProductLikesService } from './product-likes.service';

describe('ProductLikesController (TTW-269)', () => {
  let controller: ProductLikesController;
  const service = { getState: jest.fn(), like: jest.fn(), unlike: jest.fn() };
  const user = { id: 'u1' } as RequestUser;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductLikesController],
      providers: [{ provide: ProductLikesService, useValue: service }],
    }).compile();
    controller = module.get(ProductLikesController);
  });

  it.each([
    ['getState', 'getState'],
    ['like', 'like'],
    ['unlike', 'unlike'],
  ] as const)('%s acts on the user of the session', async (handler, method) => {
    const state = { productId: 'p1', likedByMe: true, likeCount: 1 };
    service[method].mockResolvedValue(state);

    await expect(controller[handler](user, 'p1')).resolves.toBe(state);
    expect(service[method]).toHaveBeenCalledWith('u1', 'p1');
  });

  it('keeps every like route behind the session guard', () => {
    const targets = [
      ProductLikesController,
      ProductLikesController.prototype.getState,
      ProductLikesController.prototype.like,
      ProductLikesController.prototype.unlike,
    ];
    for (const target of targets) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, target)).toBeUndefined();
    }
  });
});
