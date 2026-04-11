import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiParam,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { DesignsService } from './designs.service';
import { CreateDesignDto } from './dto/create-design.dto';
import { UpdateDesignDto } from './dto/update-design.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Designs')
@Controller('designs')
@UseGuards(JwtAuthGuard)
export class DesignsController {
  constructor(private readonly designsService: DesignsService) {}

  /**
   * Create a new design
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a design' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiBody({ type: CreateDesignDto })
  @ApiResponse({ status: 201, description: 'Design created' })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or product not found',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() createDesignDto: CreateDesignDto,
  ) {
    return this.designsService.create(user.id, createDesignDto);
  }

  /**
   * List current user's designs
   */
  @Get()
  @ApiOperation({ summary: 'List my designs' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'List of designs' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@CurrentUser() user: RequestUser) {
    return this.designsService.findAll(user.id);
  }

  /**
   * Get a design by ID (own only)
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get design by ID' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Design ID' })
  @ApiResponse({ status: 200, description: 'Design' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Design not found' })
  async findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.designsService.findOne(user.id, id);
  }

  /**
   * Update a design (own only)
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a design' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Design ID' })
  @ApiBody({ type: UpdateDesignDto })
  @ApiResponse({ status: 200, description: 'Design updated' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Design not found' })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() updateDesignDto: UpdateDesignDto,
  ) {
    return this.designsService.update(user.id, id, updateDesignDto);
  }

  /**
   * Delete a design (own only)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a design' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Design ID' })
  @ApiResponse({ status: 204, description: 'Design deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Design not found' })
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.designsService.remove(user.id, id);
  }

  /**
   * Upload a thumbnail for a design (PNG/WebP, ≤ 2 MB). Updates Design.thumbnailUrl.
   */
  @Post(':id/thumbnail')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('thumbnail', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  @ApiOperation({ summary: 'Upload design thumbnail' })
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Design ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { thumbnail: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Thumbnail uploaded',
    schema: {
      type: 'object',
      properties: { thumbnailUrl: { type: 'string' } },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid file or missing' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Design not found' })
  async uploadThumbnail(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('thumbnail file is required');
    return this.designsService.uploadThumbnail(user.id, id, {
      buffer: file.buffer,
      mimetype: file.mimetype,
    });
  }

  /**
   * Duplicate a design (own only). Clones rows and resets moderation to PENDING.
   */
  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Duplicate a design' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Design ID' })
  @ApiResponse({ status: 201, description: 'Duplicated design' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Design not found' })
  async duplicate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.designsService.duplicate(user.id, id);
  }

  /**
   * Generate a share token for a design (own only). Returns a read-only share URL.
   */
  @Post(':id/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a share link for a design' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Design ID' })
  @ApiResponse({
    status: 200,
    description: 'Share token generated',
    schema: {
      type: 'object',
      properties: {
        shareToken: { type: 'string' },
        shareUrl: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Design not found' })
  async share(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return this.designsService.generateShareToken(user.id, id, baseUrl);
  }
}
