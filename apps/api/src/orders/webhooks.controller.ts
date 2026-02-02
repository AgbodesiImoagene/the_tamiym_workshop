import { Controller, Post, Req, Headers } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { PaystackWebhookService } from './paystack-webhook.service';
import { UnauthorizedException } from '@nestjs/common';

@ApiTags('Orders')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly paystackWebhookService: PaystackWebhookService,
  ) {}

  /**
   * Paystack webhook. Verify x-paystack-signature and process charge.success (idempotent).
   * Raw body must be available on req.rawBody for signature verification (see main.ts middleware).
   */
  @Post('paystack')
  @Public()
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Paystack webhook (internal)' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async paystack(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const rawBody =
      req.rawBody ??
      (req.body ? Buffer.from(JSON.stringify(req.body)) : Buffer.from(''));
    if (!signature) {
      throw new UnauthorizedException('Missing x-paystack-signature');
    }
    await this.paystackWebhookService.handleWebhook(rawBody, signature);
    return { received: true };
  }
}
