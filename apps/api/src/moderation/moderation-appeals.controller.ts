import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateAppealDto } from './dto/create-appeal.dto';
import { ModerationDecisionService } from './moderation-decision.service';

@ApiTags('Moderation appeals')
@Controller('moderation/appeals')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@ApiBearerAuth('JWT-auth')
@ApiCookieAuth('access_token')
export class ModerationAppealsController {
  constructor(private readonly decisions: ModerationDecisionService) {}

  @Get()
  @ApiOperation({ summary: 'List own moderation appeals' })
  @ApiResponse({ status: 200, description: 'Appeals for the current user' })
  list(@CurrentUser() user: RequestUser) {
    return this.decisions.listAppealsForOwner(user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one own appeal (customer-safe decision fields only)',
  })
  @ApiParam({ name: 'id', description: 'Appeal ID' })
  @ApiResponse({ status: 200, description: 'Appeal detail' })
  @ApiResponse({ status: 404, description: 'Not found' })
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.decisions.getAppealForOwner(user.id, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create an appeal for an eligible decision' })
  @ApiResponse({ status: 201, description: 'Appeal created' })
  @ApiResponse({ status: 400, description: 'Not eligible / window expired' })
  @ApiResponse({ status: 409, description: 'Active appeal already exists' })
  create(@CurrentUser() user: RequestUser, @Body() body: CreateAppealDto) {
    return this.decisions.createAppeal(
      user.id,
      body.decisionId,
      body.statement,
    );
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Withdraw a PENDING appeal' })
  @ApiParam({ name: 'id', description: 'Appeal ID' })
  @ApiResponse({ status: 200, description: 'Appeal withdrawn' })
  withdraw(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.decisions.withdrawAppeal(user.id, id);
  }
}
