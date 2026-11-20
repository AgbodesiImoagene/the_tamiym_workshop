import {
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  Param,
  ParseEnumPipe,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import {
  DESIGN_ASSET_VARIANTS,
  DesignAssetsService,
} from '../design-assets/design-assets.service';
import type { DesignAssetVariant } from '../design-assets/design-assets.service';
import { DesignsService } from './designs.service';

const VARIANT_PIPE = new ParseEnumPipe(
  Object.fromEntries(DESIGN_ASSET_VARIANTS.map((v) => [v, v])),
);

@ApiTags('Designs (Public)')
@Controller('public/designs')
@UseGuards(ThrottlerGuard)
export class PublicDesignsController {
  constructor(
    private readonly designsService: DesignsService,
    private readonly designAssetsService: DesignAssetsService,
  ) {}

  /**
   * Retrieve a shared design by bearer token. No authentication required.
   * Denials are uniform NotFound (no enumeration). Cache headers discourage
   * storing bearer-capable responses.
   */
  @Get(':shareToken')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @ApiOperation({ summary: 'Get shared design by share token' })
  @ApiParam({
    name: 'shareToken',
    description: 'High-entropy design share bearer token',
  })
  @ApiResponse({
    status: 200,
    description: 'Shared design (read-only allowlist)',
  })
  @ApiResponse({ status: 404, description: 'Shared design not found' })
  findByShareToken(@Param('shareToken') shareToken: string) {
    return this.designsService.findByShareToken(shareToken);
  }

  /**
   * Bytes of a private customer image used by a shared design (TTW-234). No session: the
   * share token is the capability. It opens only images that its own design uses and that
   * belong to the design's owner. Every denial is a uniform 404.
   */
  @Get(':shareToken/assets/:designAssetId/file')
  @Public()
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'Read a customer image used by a shared design' })
  @ApiParam({
    name: 'shareToken',
    description: 'High-entropy design share bearer token',
  })
  @ApiParam({ name: 'designAssetId', description: 'Design asset id' })
  @ApiQuery({
    name: 'variant',
    enum: DESIGN_ASSET_VARIANTS,
    required: false,
    description: 'Which rendition to read. Defaults to the original.',
  })
  @ApiResponse({
    status: 200,
    description: 'The image (PNG, JPEG or WebP).',
    content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 400, description: 'Unknown variant' })
  @ApiResponse({
    status: 404,
    description:
      'Unknown, revoked or expired link, design not approved, image not used by this design or owned by someone else, file not usable, or rendition not ready',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async sharedAssetFile(
    @Param('shareToken') shareToken: string,
    @Param('designAssetId') designAssetId: string,
    @Query('variant', new DefaultValuePipe('original'), VARIANT_PIPE)
    variant: DesignAssetVariant,
  ) {
    const { stream, contentType, contentLength } =
      await this.designAssetsService.openSharedFile(
        shareToken,
        designAssetId,
        variant,
      );
    return new StreamableFile(stream, {
      type: contentType,
      disposition: 'inline',
      length: contentLength,
    });
  }
}
