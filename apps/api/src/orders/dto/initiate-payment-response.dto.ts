import { ApiProperty } from '@nestjs/swagger';

/** Response for POST /orders/:id/initiate-payment (TTW-012). */
export class InitiatePaymentResponseDto {
  @ApiProperty({
    example: 'https://checkout.paystack.com/xxx',
    description: 'Paystack authorization URL for redirect checkout',
  })
  authorizationUrl!: string;

  @ApiProperty({
    example: 'ord-clxyz-ab12cd',
    description: 'Stable payment attempt / Paystack transaction reference',
  })
  reference!: string;

  @ApiProperty({
    example: 'access_xxx',
    description: 'Paystack access_code for the same checkout session',
  })
  accessCode!: string;

  @ApiProperty({
    enum: ['created', 'reused', 'reconciled'],
    description:
      'created = new provider session after reserve; reused = returned an existing INITIATED session; reconciled = recovered a lost PENDING response via same-ref initialize',
  })
  attemptOutcome!: 'created' | 'reused' | 'reconciled';
}
