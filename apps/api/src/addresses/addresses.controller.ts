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
import type { RequestUser } from '../auth/strategies/jwt.strategy';

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
        addressLine1: { type: 'string' },
        addressLine2: { type: 'string', nullable: true },
        recipientName: { type: 'string', nullable: true },
        phone: { type: 'string', nullable: true },
        city: { type: 'string' },
        state: { type: 'string' },
        postalCode: { type: 'string', nullable: true },
        country: { type: 'string' },
        countryCode: { type: 'string' },
        landmark: { type: 'string', nullable: true },
        instructions: { type: 'string', nullable: true },
        locality: { type: 'string', nullable: true },
        dependentLocality: { type: 'string', nullable: true },
        administrativeAreaLevel1: { type: 'string', nullable: true },
        administrativeAreaLevel2: { type: 'string', nullable: true },
        stateCode: { type: 'string', nullable: true },
        lgaId: { type: 'string', nullable: true },
        provider: { type: 'string' },
        googlePlaceId: { type: 'string', nullable: true },
        formattedAddress: { type: 'string', nullable: true },
        latitude: { type: 'number', nullable: true },
        longitude: { type: 'number', nullable: true },
        isDefault: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @CurrentUser() user: RequestUser,
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
          addressLine1: { type: 'string' },
          addressLine2: { type: 'string', nullable: true },
          recipientName: { type: 'string', nullable: true },
          phone: { type: 'string', nullable: true },
          city: { type: 'string' },
          state: { type: 'string' },
          postalCode: { type: 'string', nullable: true },
          country: { type: 'string' },
          countryCode: { type: 'string' },
          landmark: { type: 'string', nullable: true },
          instructions: { type: 'string', nullable: true },
          locality: { type: 'string', nullable: true },
          dependentLocality: { type: 'string', nullable: true },
          administrativeAreaLevel1: { type: 'string', nullable: true },
          administrativeAreaLevel2: { type: 'string', nullable: true },
          stateCode: { type: 'string', nullable: true },
          lgaId: { type: 'string', nullable: true },
          provider: { type: 'string' },
          googlePlaceId: { type: 'string', nullable: true },
          formattedAddress: { type: 'string', nullable: true },
          latitude: { type: 'number', nullable: true },
          longitude: { type: 'number', nullable: true },
          isDefault: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@CurrentUser() user: RequestUser) {
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
        addressLine1: { type: 'string' },
        addressLine2: { type: 'string', nullable: true },
        recipientName: { type: 'string', nullable: true },
        phone: { type: 'string', nullable: true },
        city: { type: 'string' },
        state: { type: 'string' },
        postalCode: { type: 'string', nullable: true },
        country: { type: 'string' },
        countryCode: { type: 'string' },
        landmark: { type: 'string', nullable: true },
        instructions: { type: 'string', nullable: true },
        locality: { type: 'string', nullable: true },
        dependentLocality: { type: 'string', nullable: true },
        administrativeAreaLevel1: { type: 'string', nullable: true },
        administrativeAreaLevel2: { type: 'string', nullable: true },
        stateCode: { type: 'string', nullable: true },
        lgaId: { type: 'string', nullable: true },
        provider: { type: 'string' },
        googlePlaceId: { type: 'string', nullable: true },
        formattedAddress: { type: 'string', nullable: true },
        latitude: { type: 'number', nullable: true },
        longitude: { type: 'number', nullable: true },
        isDefault: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async findUnique(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.addressesService.findUnique(user.id, id);
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
        addressLine1: { type: 'string' },
        addressLine2: { type: 'string', nullable: true },
        recipientName: { type: 'string', nullable: true },
        phone: { type: 'string', nullable: true },
        city: { type: 'string' },
        state: { type: 'string' },
        postalCode: { type: 'string', nullable: true },
        country: { type: 'string' },
        countryCode: { type: 'string' },
        landmark: { type: 'string', nullable: true },
        instructions: { type: 'string', nullable: true },
        locality: { type: 'string', nullable: true },
        dependentLocality: { type: 'string', nullable: true },
        administrativeAreaLevel1: { type: 'string', nullable: true },
        administrativeAreaLevel2: { type: 'string', nullable: true },
        stateCode: { type: 'string', nullable: true },
        lgaId: { type: 'string', nullable: true },
        provider: { type: 'string' },
        googlePlaceId: { type: 'string', nullable: true },
        formattedAddress: { type: 'string', nullable: true },
        latitude: { type: 'number', nullable: true },
        longitude: { type: 'number', nullable: true },
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
    @CurrentUser() user: RequestUser,
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
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.addressesService.remove(user.id, id);
  }
}
