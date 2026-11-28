import { ApiProperty } from '@nestjs/swagger';

/** The like of one product as the signed-in user sees it (TTW-269). */
export class ProductLikeStateDto {
  @ApiProperty({ description: 'Product ID' })
  productId!: string;

  @ApiProperty({ description: 'Whether the signed-in user likes the product' })
  likedByMe!: boolean;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'Number of users who like the product',
  })
  likeCount!: number;
}
