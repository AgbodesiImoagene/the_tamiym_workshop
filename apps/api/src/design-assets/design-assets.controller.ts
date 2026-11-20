import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  ParseEnumPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  DESIGN_ASSET_VARIANTS,
  DesignAssetsService,
} from './design-assets.service';
import type { DesignAssetVariant } from './design-assets.service';
import { SIGNED_READ_URL_TTL_SECONDS } from '../storage/s3.service';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

const VARIANT_PIPE = new ParseEnumPipe(
  Object.fromEntries(DESIGN_ASSET_VARIANTS.map((v) => [v, v])),
);

@ApiTags('Design Assets')
@Controller('design-assets')
@UseGuards(JwtAuthGuard)
export class DesignAssetsController {
  constructor(private readonly designAssetsService: DesignAssetsService) {}

  /**
   * Upload a user image asset (PNG/JPEG/WebP, ≤ 10 MB) to use as an image layer
   * in the Design Workshop. Creates a private MediaAsset + DesignAsset record; queues
   * background processing (derivatives, virus scan, moderation). The file is read back
   * through `GET /design-assets/:id/file`.
   */
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @ApiOperation({ summary: 'Upload a design asset (image layer)' })
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Asset upload initiated',
    schema: {
      type: 'object',
      properties: {
        designAssetId: { type: 'string' },
        status: { type: 'string', example: 'pending' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing or unsupported file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async upload(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.designAssetsService.upload(user.id, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    });
  }

  /**
   * Bytes of a private customer file (TTW-099). Stable path: saved designs reference it.
   * Authenticated, so the workshop canvas loads it with credentials and no storage link.
   */
  @Get(':id/file')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'Read a private design asset (image bytes)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Design asset id' })
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
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 404,
    description:
      'Unknown file, file owned by someone else, file not usable (infected, rejected, failed) or rendition not ready',
  })
  async file(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query('variant', new DefaultValuePipe('original'), VARIANT_PIPE)
    variant: DesignAssetVariant,
  ) {
    const { stream, contentType, contentLength } =
      await this.designAssetsService.openFile(user, id, variant);
    return new StreamableFile(stream, {
      type: contentType,
      disposition: 'inline',
      length: contentLength,
    });
  }

  /**
   * Short-lived signed link to a private customer file (TTW-099), for a direct download
   * from storage. The link expires in about 5 minutes: never store, log or share it.
   */
  @Get(':id/link')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Get a short-lived signed link to a private design asset',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Design asset id' })
  @ApiQuery({
    name: 'variant',
    enum: DESIGN_ASSET_VARIANTS,
    required: false,
    description: 'Which rendition to link. Defaults to the original.',
  })
  @ApiResponse({
    status: 200,
    description: 'Signed link and its lifetime',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        expiresInSeconds: { type: 'integer', example: 300 },
      },
      required: ['url', 'expiresInSeconds'],
    },
  })
  @ApiResponse({ status: 400, description: 'Unknown variant' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 404,
    description:
      'Unknown file, file owned by someone else, file not usable (infected, rejected, failed) or rendition not ready',
  })
  async link(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query('variant', new DefaultValuePipe('original'), VARIANT_PIPE)
    variant: DesignAssetVariant,
  ) {
    const url = await this.designAssetsService.createReadLink(
      user,
      id,
      variant,
    );
    return { url, expiresInSeconds: SIGNED_READ_URL_TTL_SECONDS };
  }
}
