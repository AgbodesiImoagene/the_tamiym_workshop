import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
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
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { CreateShippingZoneDto } from './dto/create-shipping-zone.dto';
import { UpdateShippingZoneDto } from './dto/update-shipping-zone.dto';
import { CreateShippingZoneAreaDto } from './dto/create-shipping-zone-area.dto';
import { CreateShippingRateDto } from './dto/create-shipping-rate.dto';
import { UpdateShippingRateDto } from './dto/update-shipping-rate.dto';
import { CreateShippingRuleDto } from './dto/create-shipping-rule.dto';
import { UpdateShippingRuleDto } from './dto/update-shipping-rule.dto';
import { ShippingAdminService } from '../shipping/shipping-admin.service';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminShippingController {
  constructor(private readonly shippingAdmin: ShippingAdminService) {}

  @Get('geo/states')
  @ApiOperation({ summary: 'List geo states (e.g. Nigeria)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'List of states' })
  async listStates() {
    return this.shippingAdmin.listStates();
  }

  @Get('geo/states/:code/lgas')
  @ApiOperation({ summary: 'List LGAs for a state' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'code', description: 'State code (e.g. LA)' })
  @ApiResponse({ status: 200, description: 'List of LGAs' })
  @ApiResponse({ status: 404, description: 'State not found' })
  async listLgas(@Param('code') code: string) {
    return this.shippingAdmin.listLgas(code);
  }

  @Get('shipping-zones')
  @ApiOperation({ summary: 'List shipping zones' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'List of zones with legacy areas, generic rules, and rates',
  })
  async listZones() {
    return this.shippingAdmin.listZones();
  }

  @Post('shipping-zones')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create shipping zone' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 201, description: 'Zone created' })
  async createZone(@Body() dto: CreateShippingZoneDto) {
    return this.shippingAdmin.createZone(dto);
  }

  @Get('shipping-zones/:id')
  @ApiOperation({ summary: 'Get shipping zone by ID' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Zone ID' })
  @ApiResponse({
    status: 200,
    description: 'Zone with legacy areas, generic rules, and rates',
  })
  @ApiResponse({ status: 404, description: 'Zone not found' })
  async getZone(@Param('id') id: string) {
    return this.shippingAdmin.getZone(id);
  }

  @Patch('shipping-zones/:id')
  @ApiOperation({ summary: 'Update shipping zone' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Zone ID' })
  @ApiResponse({ status: 200, description: 'Zone updated' })
  @ApiResponse({ status: 404, description: 'Zone not found' })
  async updateZone(
    @Param('id') id: string,
    @Body() dto: UpdateShippingZoneDto,
  ) {
    return this.shippingAdmin.updateZone(id, dto);
  }

  @Delete('shipping-zones/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete shipping zone' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Zone ID' })
  @ApiResponse({ status: 204, description: 'Zone deleted' })
  @ApiResponse({ status: 404, description: 'Zone not found' })
  async deleteZone(@Param('id') id: string) {
    await this.shippingAdmin.deleteZone(id);
  }

  @Get('shipping-zones/:zoneId/areas')
  @ApiOperation({ summary: 'List areas for a zone' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'zoneId', description: 'Zone ID' })
  @ApiResponse({ status: 200, description: 'List of legacy Nigeria areas' })
  async listAreas(@Param('zoneId') zoneId: string) {
    return this.shippingAdmin.listAreas(zoneId);
  }

  @Post('shipping-zones/:zoneId/areas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add area to zone' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'zoneId', description: 'Zone ID' })
  @ApiResponse({ status: 201, description: 'Area created' })
  @ApiResponse({ status: 400, description: 'Invalid state/LGA' })
  async createArea(
    @Param('zoneId') zoneId: string,
    @Body() dto: CreateShippingZoneAreaDto,
  ) {
    return this.shippingAdmin.createArea(zoneId, dto);
  }

  @Get('shipping-zones/:zoneId/rules')
  @ApiOperation({ summary: 'List generic shipping rules for a zone' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'zoneId', description: 'Zone ID' })
  @ApiResponse({ status: 200, description: 'List of shipping rules' })
  async listRules(@Param('zoneId') zoneId: string) {
    return this.shippingAdmin.listRules(zoneId);
  }

  @Post('shipping-zones/:zoneId/rules')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add generic shipping rule to zone' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'zoneId', description: 'Zone ID' })
  @ApiResponse({ status: 201, description: 'Rule created' })
  @ApiResponse({ status: 400, description: 'Invalid rule input' })
  async createRule(
    @Param('zoneId') zoneId: string,
    @Body() dto: CreateShippingRuleDto,
  ) {
    return this.shippingAdmin.createRule(zoneId, dto);
  }

  @Patch('shipping-rules/:id')
  @ApiOperation({ summary: 'Update generic shipping rule' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Shipping rule ID' })
  @ApiResponse({ status: 200, description: 'Rule updated' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateShippingRuleDto,
  ) {
    return this.shippingAdmin.updateRule(id, dto);
  }

  @Delete('shipping-rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete generic shipping rule' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Shipping rule ID' })
  @ApiResponse({ status: 204, description: 'Rule deleted' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  async deleteRule(@Param('id') id: string) {
    await this.shippingAdmin.deleteRule(id);
  }

  @Get('shipping-zones/:zoneId/rates')
  @ApiOperation({ summary: 'List rates for a zone' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'zoneId', description: 'Zone ID' })
  @ApiResponse({ status: 200, description: 'List of rates' })
  async listRates(@Param('zoneId') zoneId: string) {
    return this.shippingAdmin.listRates(zoneId);
  }

  @Post('shipping-zones/:zoneId/rates')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add rate to zone' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'zoneId', description: 'Zone ID' })
  @ApiResponse({ status: 201, description: 'Rate created' })
  async createRate(
    @Param('zoneId') zoneId: string,
    @Body() dto: CreateShippingRateDto,
  ) {
    return this.shippingAdmin.createRate(zoneId, dto);
  }

  @Patch('shipping-rates/:id')
  @ApiOperation({ summary: 'Update shipping rate' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Shipping rate ID' })
  @ApiResponse({ status: 200, description: 'Rate updated' })
  @ApiResponse({ status: 404, description: 'Rate not found' })
  async updateRate(
    @Param('id') id: string,
    @Body() dto: UpdateShippingRateDto,
  ) {
    return this.shippingAdmin.updateRate(id, dto);
  }

  @Delete('shipping-rates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete shipping rate' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Shipping rate ID' })
  @ApiResponse({ status: 204, description: 'Rate deleted' })
  @ApiResponse({ status: 404, description: 'Rate not found' })
  async deleteRate(@Param('id') id: string) {
    await this.shippingAdmin.deleteRate(id);
  }
}
