import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PayoutMode } from '../../generated/prisma/enums';

export class UpdateCampaignPayoutPolicyDto {
  @ApiPropertyOptional({
    enum: PayoutMode,
    nullable: true,
    description:
      'Override site payout mode for this campaign, or null to clear and use site default (admin only)',
  })
  @IsOptional()
  @IsEnum(PayoutMode)
  payoutModeOverride?: PayoutMode | null;
}
