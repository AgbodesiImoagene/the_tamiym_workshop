import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  Res,
  Put,
  Post,
  Body,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { UserThrottlerGuard } from './user-throttler.guard';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UserAvatarService } from './user-avatar.service';
import { AVATAR_MAX_BYTES } from './avatar-image';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../generated/prisma/client';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userAvatarService: UserAvatarService,
  ) {}

  /**
   * Get current user profile
   */
  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
        phone: { type: 'string', nullable: true },
        role: { type: 'string', enum: Object.values(UserRole) },
        status: { type: 'string', example: 'ACTIVE' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getProfile(@CurrentUser() user: RequestUser) {
    return this.usersService.getProfile(user.id);
  }

  /**
   * Update current user profile
   */
  @Put('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
        phone: { type: 'string', nullable: true },
        role: { type: 'string', enum: Object.values(UserRole) },
        status: { type: 'string', example: 'ACTIVE' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, updateProfileDto);
  }

  /**
   * Upload or replace the caller's profile picture (TTW-263). The image is scanned,
   * checked from its bytes, cropped to a square, shrunk to at most 256 px and stored as
   * WebP in the private bucket. The original is never kept.
   */
  @Post('profile/avatar')
  @HttpCode(HttpStatus.CREATED)
  // Each call costs up to 5 MB of memory, a virus scan and an image decode.
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  @ApiOperation({ summary: 'Upload the current user profile picture' })
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Picture stored. `avatarVersion` busts caches of the picture.',
    schema: {
      type: 'object',
      properties: { avatarVersion: { type: 'string' } },
      required: ['avatarVersion'],
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Missing file, file over 5 MB, not a JPEG, PNG or WebP image, or rejected by the scan',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 409,
    description: 'The picture was changed at the same time; try again',
  })
  @ApiResponse({
    status: 503,
    description: 'The file scanner is unavailable; nothing was stored',
  })
  async uploadAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.userAvatarService.setAvatar(user.id, file.buffer);
  }

  /**
   * Remove the caller's profile picture. Does nothing when there is none.
   */
  @Delete('profile/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove the current user profile picture' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 204, description: 'Picture removed (or none)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async removeAvatar(@CurrentUser() user: RequestUser): Promise<void> {
    await this.userAvatarService.removeAvatar(user.id);
  }

  /**
   * The caller's own profile picture (WebP). There is no user id in the path: nobody can
   * read another account's picture. Authenticated, so it is never cached by a shared cache.
   */
  @Get('profile/avatar')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'Read the current user profile picture' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'The picture, as a 256 px WebP image.',
    content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'The user has no picture' })
  async getAvatar(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, contentType, contentLength } =
      await this.userAvatarService.openAvatar(user.id);
    // Only a successful read may be cached (the URL carries the version of the picture).
    // A header set before the handler would also cache the 404 and 500 answers.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return new StreamableFile(stream, {
      type: contentType,
      disposition: 'inline',
      length: contentLength,
    });
  }
}
