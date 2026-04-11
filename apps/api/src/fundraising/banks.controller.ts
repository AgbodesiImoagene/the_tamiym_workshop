import {
  Controller,
  Get,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { PaystackTransferProviderService } from '../payouts/paystack-transfer.provider';

// Account-number probing is a privacy/fraud risk: tighten the rate limit
// relative to the global default (3 req/min → 10 req/min per route).
const RESOLVE_THROTTLE_LIMIT = 10;
const RESOLVE_THROTTLE_TTL_MS = 60_000;

@ApiTags('Fundraising')
@Controller('banks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ORGANIZER, UserRole.ADMIN)
export class BanksController {
  constructor(
    private readonly paystackProvider: PaystackTransferProviderService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List Nigerian banks (for payout profile setup)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'List of banks with code and name' })
  async listBanks() {
    return this.paystackProvider.listBanks();
  }

  @Get('resolve')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: { limit: RESOLVE_THROTTLE_LIMIT, ttl: RESOLVE_THROTTLE_TTL_MS },
  })
  @ApiOperation({
    summary: 'Resolve account name from account number and bank code',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({ name: 'accountNumber', required: true })
  @ApiQuery({ name: 'bankCode', required: true })
  @ApiResponse({ status: 200, description: 'Resolved account name' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async resolveAccount(
    @Query('accountNumber') accountNumber: string,
    @Query('bankCode') bankCode: string,
  ) {
    const result = await this.paystackProvider.resolveAccount(
      accountNumber,
      bankCode,
    );
    if (!result) {
      throw new NotFoundException('Account not found');
    }
    return result;
  }
}
