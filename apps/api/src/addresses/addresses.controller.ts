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
} from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Users')
@Controller('users/addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  /**
   * Create a new shipping address
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new shipping address' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 201,
    description: 'Address created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        userId: { type: 'string' },
        street: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        postalCode: { type: 'string' },
        country: { type: 'string' },
        isDefault: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @CurrentUser() user: any,
    @Body() createAddressDto: CreateAddressDto,
  ) {
    return this.addressesService.create(user.id, createAddressDto);
  }

  /**
   * Get all shipping addresses for current user
   */
  @Get()
  @ApiOperation({ summary: 'Get all shipping addresses' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'List of addresses retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string' },
          street: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          postalCode: { type: 'string' },
          country: { type: 'string' },
          isDefault: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@CurrentUser() user: any) {
    return this.addressesService.findAll(user.id);
  }

  /**
   * Get a single address by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a shipping address by ID' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Address ID' })
  @ApiResponse({
    status: 200,
    description: 'Address retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        userId: { type: 'string' },
        street: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        postalCode: { type: 'string' },
        country: { type: 'string' },
        isDefault: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.addressesService.findOne(user.id, id);
  }

  /**
   * Update an address
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a shipping address' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Address ID' })
  @ApiResponse({
    status: 200,
    description: 'Address updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        userId: { type: 'string' },
        street: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        postalCode: { type: 'string' },
        country: { type: 'string' },
        isDefault: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateAddressDto: UpdateAddressDto,
  ) {
    return this.addressesService.update(user.id, id, updateAddressDto);
  }

  /**
   * Delete an address
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a shipping address' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Address ID' })
  @ApiResponse({ status: 204, description: 'Address deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    await this.addressesService.remove(user.id, id);
  }
}
