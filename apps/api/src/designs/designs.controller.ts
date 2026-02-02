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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
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
}
