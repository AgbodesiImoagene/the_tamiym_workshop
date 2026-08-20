import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CampaignsService } from './campaigns.service';
import { runWithRequestContext } from '../request-context/request-context.store';

/**
 * Scheduled task: end active fundraising campaigns whose endDate has passed.
 * Runs every 5 minutes so public listings and checkout stay aligned with campaign timing.
 */
@Injectable()
export class CampaignExpiryService {
  private readonly logger = new Logger(CampaignExpiryService.name);

  constructor(private readonly campaignsService: CampaignsService) {}

  @Cron('*/5 * * * *')
  async endExpiredCampaigns() {
    const now = new Date();
    return runWithRequestContext(
      {
        requestId: `cron:campaign-expiry:${now.toISOString()}`,
        source: 'CRON',
      },
      async () => {
        const endedCount = await this.campaignsService.endExpiredCampaigns(now);
        if (endedCount > 0) {
          this.logger.log(`Ended ${endedCount} expired campaign(s)`);
        }
      },
    );
  }
}
