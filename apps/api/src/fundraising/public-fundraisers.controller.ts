import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { Public } from '../auth/decorators/public.decorator';
import { PublicFundraiserResponseDto } from './dto/public-fundraiser-response.dto';

@ApiTags('Fundraising')
@ApiExtraModels(PublicFundraiserResponseDto)
@Controller('public/fundraisers')
export class PublicFundraisersController {
  constructor(private readonly campaignsService: CampaignsService) {}

  /**
   * Get campaign by slug (public, read-only). Includes sellable offers and performance snapshot.
   */
  @Get(':slug')
  @Public()
  @ApiOperation({
    summary: 'Get public fundraiser by slug',
    description:
      'Returns ACTIVE, in-window campaigns with disclosure-safe sellable offers ' +
      '(policy public-campaign-offer/v1-interim-2026-08-21). Does not expose SKU, ' +
      'cost basis, moderation notes, or exact inventory.',
  })
  @ApiParam({ name: 'slug', description: 'Campaign slug' })
  @ApiResponse({
    status: 200,
    description: 'Campaign with sellable offers and performance snapshot',
    schema: { $ref: getSchemaPath(PublicFundraiserResponseDto) },
  })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  getBySlug(@Param('slug') slug: string): Promise<PublicFundraiserResponseDto> {
    return this.campaignsService.getBySlug(slug);
  }
}
