import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { DesignsService } from './designs.service';

@ApiTags('Designs (Public)')
@Controller('public/designs')
@UseGuards(ThrottlerGuard)
export class PublicDesignsController {
  constructor(private readonly designsService: DesignsService) {}

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
}
