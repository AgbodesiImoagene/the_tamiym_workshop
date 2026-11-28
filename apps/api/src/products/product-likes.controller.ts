import { Controller, Delete, Get, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ProductLikeStateDto } from './dto/product-like-response.dto';
import { ProductLikesService } from './product-likes.service';

const NOT_FOUND = 'Unknown product, or a product that is not active';
const NO_SESSION = 'No valid session';
const NO_CSRF =
  'Browser session without a valid X-CSRF-Token header or from a disallowed Origin';

/**
 * TTW-269: the like of the signed-in user on a product. The routes take no body and are
 * never public: the user always comes from the session. The like count alone is also on
 * the public product detail.
 */
@ApiTags('Products')
@ApiBearerAuth('JWT-auth')
@ApiCookieAuth('access_token')
@Controller('products/:id/like')
export class ProductLikesController {
  constructor(private readonly likes: ProductLikesService) {}

  @Get()
  @ApiOperation({ summary: 'Read my like on a product and its like count' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: ProductLikeStateDto })
  @ApiResponse({ status: 401, description: NO_SESSION })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  getState(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.likes.getState(user.id, id);
  }

  @Put()
  @ApiOperation({
    summary: 'Like a product',
    description: 'Idempotent: liking a product already liked changes nothing.',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: ProductLikeStateDto })
  @ApiResponse({ status: 401, description: NO_SESSION })
  @ApiResponse({ status: 403, description: NO_CSRF })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  like(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.likes.like(user.id, id);
  }

  @Delete()
  @ApiOperation({
    summary: 'Remove my like from a product',
    description:
      'Idempotent: removing a like that does not exist changes nothing.',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: ProductLikeStateDto })
  @ApiResponse({ status: 401, description: NO_SESSION })
  @ApiResponse({ status: 403, description: NO_CSRF })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  unlike(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.likes.unlike(user.id, id);
  }
}
