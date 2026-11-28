import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { ProductStatus, UserStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ProductLikeStateDto } from './dto/product-like-response.dto';

/**
 * TTW-269: one like per user and product, guaranteed by the unique constraint of
 * `product_likes`. Liking and unliking are idempotent and safe to send at the same time:
 * neither decides what to write from whether the like already exists.
 */
@Injectable()
export class ProductLikesService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(
    userId: string,
    productId: string,
  ): Promise<ProductLikeStateDto> {
    await this.assertActiveProduct(productId);
    return this.readState(userId, productId);
  }

  async like(userId: string, productId: string): Promise<ProductLikeStateDto> {
    await this.assertActiveProduct(productId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockActiveAccount(tx, userId);
        // ON CONFLICT DO NOTHING: an existing like, or a concurrent twin, is not an error.
        await tx.productLike.createMany({
          data: [{ userId, productId }],
          skipDuplicates: true,
        });
      });
    } catch (error) {
      // Foreign key: the product was deleted after the check above.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Product not found');
      }
      throw error;
    }
    return this.readState(userId, productId);
  }

  async unlike(
    userId: string,
    productId: string,
  ): Promise<ProductLikeStateDto> {
    await this.assertActiveProduct(productId);
    await this.prisma.productLike.deleteMany({ where: { userId, productId } });
    return this.readState(userId, productId);
  }

  /** Same visibility as the public product detail: only ACTIVE products exist here. */
  private async assertActiveProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: ProductStatus.ACTIVE },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
  }

  /**
   * Account erasure keeps the user row: it first updates it, then deletes the likes, in one
   * transaction. The session check of a request can predate that. The shared lock waits for
   * an erasure in progress (and then finds no active account), and makes an erasure that
   * starts now wait for this like, which its deletion then removes.
   */
  private async lockActiveAccount(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "users"
      WHERE "id" = ${userId} AND "status" = ${UserStatus.ACTIVE}::"UserStatus"
      FOR SHARE`;
    if (rows.length === 0) {
      throw new UnauthorizedException('User not found');
    }
  }

  /** Both counts come from one snapshot, so the answer never contradicts itself. */
  private async readState(
    userId: string,
    productId: string,
  ): Promise<ProductLikeStateDto> {
    const [mine, likeCount] = await this.prisma.$transaction(
      [
        this.prisma.productLike.count({ where: { userId, productId } }),
        this.prisma.productLike.count({ where: { productId } }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { productId, likedByMe: mine > 0, likeCount };
  }
}
