import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { ProductStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ProductLikesService } from './product-likes.service';

describe('ProductLikesService (TTW-269)', () => {
  let service: ProductLikesService;
  const prisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    product: { findFirst: jest.fn() },
    productLike: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
  };

  /** `mine` is the caller's row count (0 or 1), `total` the product's. */
  function stubCounts(mine: number, total: number) {
    prisma.productLike.count.mockImplementation(
      ({ where }: { where: { userId?: string } }) =>
        Promise.resolve(where.userId ? mine : total),
    );
  }

  const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('db error', {
      code,
      clientVersion: 'test',
    });

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.product.findFirst.mockResolvedValue({ id: 'p1' });
    // The account row is found and locked unless a test says otherwise.
    prisma.$queryRaw.mockResolvedValue([{ id: 'u1' }]);
    prisma.$transaction.mockImplementation(
      (input: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) =>
        Array.isArray(input) ? Promise.all(input) : input(prisma),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductLikesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ProductLikesService);
  });

  it('reads the state of the caller and the total count', async () => {
    stubCounts(1, 7);

    await expect(service.getState('u1', 'p1')).resolves.toEqual({
      productId: 'p1',
      likedByMe: true,
      likeCount: 7,
    });
    expect(prisma.productLike.count).toHaveBeenCalledWith({
      where: { userId: 'u1', productId: 'p1' },
    });
    expect(prisma.productLike.count).toHaveBeenCalledWith({
      where: { productId: 'p1' },
    });
  });

  it('reports a product the caller has not liked', async () => {
    stubCounts(0, 7);

    await expect(service.getState('u1', 'p1')).resolves.toMatchObject({
      likedByMe: false,
      likeCount: 7,
    });
  });

  it('likes with an insert that ignores an existing row', async () => {
    stubCounts(1, 1);

    await expect(service.like('u1', 'p1')).resolves.toEqual({
      productId: 'p1',
      likedByMe: true,
      likeCount: 1,
    });
    expect(prisma.productLike.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u1', productId: 'p1' }],
      skipDuplicates: true,
    });
  });

  it('writes nothing and answers 401 when the account is no longer active', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(service.like('u1', 'p1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.productLike.createMany).not.toHaveBeenCalled();
  });

  it('reads both counts from one snapshot, so they cannot contradict each other', async () => {
    stubCounts(1, 1);

    await service.getState('u1', 'p1');

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it("removes only the caller's like, and does not fail when there is none", async () => {
    prisma.productLike.deleteMany.mockResolvedValue({ count: 0 });
    stubCounts(0, 2);

    await expect(service.unlike('u1', 'p1')).resolves.toEqual({
      productId: 'p1',
      likedByMe: false,
      likeCount: 2,
    });
    expect(prisma.productLike.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', productId: 'p1' },
    });
  });

  it.each(['getState', 'like', 'unlike'] as const)(
    '%s answers 404 for a product that is not active, and writes nothing',
    async (method) => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service[method]('u1', 'gone')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'gone', status: ProductStatus.ACTIVE },
        select: { id: true },
      });
      expect(prisma.productLike.createMany).not.toHaveBeenCalled();
      expect(prisma.productLike.deleteMany).not.toHaveBeenCalled();
    },
  );

  it('answers 404 when the product is deleted between the check and the insert', async () => {
    prisma.productLike.createMany.mockRejectedValue(prismaError('P2003'));

    await expect(service.like('u1', 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not hide any other database error', async () => {
    const failure = prismaError('P1001');
    prisma.productLike.createMany.mockRejectedValue(failure);

    await expect(service.like('u1', 'p1')).rejects.toBe(failure);
  });
});
