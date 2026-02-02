import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail } from 'class-validator';

export class InitiatePaymentDto {
  @ApiProperty({
    example: 'customer@example.com',
    description:
      'Customer email for Paystack (defaults to user email if omitted)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsEmail()
  customerEmail?: string;
}
