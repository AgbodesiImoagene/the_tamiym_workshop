import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { GeoService } from './geo.service';
import { GeoLgaResponseDto, GeoStateResponseDto } from './dto/geo-response.dto';

/**
 * TTW-087: read-only reference data for the address forms. The admin routes
 * under `admin/geo` stay admin-only; these return only what a form needs.
 */
@ApiTags('Geo')
@Controller('geo')
@UseGuards(JwtAuthGuard)
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('states')
  @ApiOperation({ summary: 'List the states offered in address forms' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, type: GeoStateResponseDto, isArray: true })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  listStates(): Promise<GeoStateResponseDto[]> {
    return this.geo.listStates();
  }

  @Get('states/:code/lgas')
  @ApiOperation({ summary: 'List the LGAs of a state' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'code', description: 'State code (e.g. LA)' })
  @ApiResponse({ status: 200, type: GeoLgaResponseDto, isArray: true })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  @ApiResponse({
    status: 404,
    description: 'Unknown state code (GEO_STATE_NOT_FOUND)',
  })
  listLgas(@Param('code') code: string): Promise<GeoLgaResponseDto[]> {
    return this.geo.listLgas(code);
  }
}
