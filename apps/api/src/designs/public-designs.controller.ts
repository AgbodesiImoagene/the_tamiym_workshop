import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { DesignsService } from './designs.service';

@ApiTags('Designs (Public)')
@Controller('public/designs')
export class PublicDesignsController {
  constructor(private readonly designsService: DesignsService) {}

  /**
   * Retrieve a shared design by its share token. No authentication required.
   * Internal fields (moderationNotes, userId) are excluded from the response.
   */
  @Get(':shareToken')
  @Public()
  @ApiOperation({ summary: 'Get shared design by share token' })
  @ApiParam({
    name: 'shareToken',
    description: 'Design share token (12 chars)',
  })
  @ApiResponse({
    status: 200,
    description: 'Shared design (read-only)',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        designData: { type: 'object' },
        thumbnailUrl: { type: 'string', nullable: true },
        moderationStatus: { type: 'string' },
        shareToken: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
          },
        },
        views: { type: 'array' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Design not found or link expired' })
  findByShareToken(@Param('shareToken') shareToken: string) {
    return this.designsService.findByShareToken(shareToken);
  }
}
