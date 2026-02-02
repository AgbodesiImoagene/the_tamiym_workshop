import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Fundraising')
@Controller('public/fundraisers')
export class PublicFundraisersController {
  constructor(private readonly campaignsService: CampaignsService) {}

  /**
   * Get campaign by slug (public, read-only). Includes performance snapshot.
   */
  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Get public fundraiser by slug' })
  @ApiParam({ name: 'slug', description: 'Campaign slug' })
  @ApiResponse({
    status: 200,
    description: 'Campaign with products and performance snapshot',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string', nullable: true },
        story: { type: 'string', nullable: true },
        status: { type: 'string' },
        goalAmount: { type: 'number', nullable: true },
        currentAmount: { type: 'number' },
        performance: {
          type: 'object',
          properties: {
            currentAmount: { type: 'number' },
            goalAmount: { type: 'number', nullable: true },
            currency: { type: 'string' },
          },
        },
        products: { type: 'array' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  getBySlug(@Param('slug') slug: string) {
    return this.campaignsService.getBySlug(slug);
  }
}
