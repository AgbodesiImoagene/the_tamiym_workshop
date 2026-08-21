import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CurrencyCode,
  OrderItemSnapshotSource,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
} from '../../generated/prisma/enums';
import { CUSTOMER_ORDER_DETAIL_POLICY_VERSION } from '../order-item-snapshot';
import { CustomerShipmentSummaryDto } from '../../shipments/dto/customer-shipment-summary.dto';
import { CUSTOMER_SHIPMENT_ABSENT_MESSAGE } from '../../shipments/shipments.constants';

/** One option row inside optionPresentationSnapshot. */
export class CustomerOrderOptionPresentationDto {
  @ApiProperty({ example: 'Size' })
  option!: string;

  @ApiProperty({ example: 'size' })
  optionCode!: string;

  @ApiProperty({ example: 'Large' })
  value!: string;

  @ApiProperty({ example: 'L' })
  valueCode!: string;
}

/** Customer-safe line item (display snapshots + money; no organizer cost). */
export class CustomerOrderItemDetailDto {
  @ApiProperty({ example: 'oi-1' })
  id!: string;

  @ApiProperty({ example: 'prod-1' })
  productId!: string;

  @ApiProperty({ example: 'var-1' })
  variantId!: string;

  @ApiPropertyOptional({ nullable: true, example: 'design-1' })
  designId?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'camp-1' })
  campaignId?: string | null;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({
    example: 5000,
    description: 'Unit price charged (major units)',
  })
  unitFinalPrice!: number;

  @ApiProperty({ example: 10000 })
  lineTotal!: number;

  @ApiProperty({ example: 'Classic Tee' })
  productNameSnapshot!: string;

  @ApiProperty({ example: 'Small / Red (SKU-1)' })
  variantDisplaySnapshot!: string;

  @ApiPropertyOptional({
    type: [CustomerOrderOptionPresentationDto],
    nullable: true,
  })
  optionPresentationSnapshot?: CustomerOrderOptionPresentationDto[] | null;

  @ApiProperty({ enum: OrderItemSnapshotSource })
  snapshotSource!: OrderItemSnapshotSource;

  @ApiProperty({ example: 1 })
  snapshotVersion!: number;

  @ApiPropertyOptional({
    description:
      'True when snapshotSource is BACKFILLED_CURRENT_CATALOG — display may not match what the buyer originally saw.',
  })
  legacySnapshotDisclosure?: boolean;
}

/** Immutable shipping destination from order ship* columns (not Address relation). */
export class CustomerOrderShippingSnapshotDto {
  @ApiPropertyOptional({ nullable: true })
  recipientName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiProperty()
  line1!: string;

  @ApiPropertyOptional({ nullable: true })
  line2?: string | null;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;

  @ApiPropertyOptional({ nullable: true })
  postalCode?: string | null;

  @ApiProperty({ example: 'Nigeria' })
  country!: string;

  @ApiPropertyOptional({ nullable: true })
  landmark?: string | null;
}

/** Safe payment attempt summary — no rawEvent, idempotencyKey, or provider URLs. */
export class CustomerOrderPaymentSummaryDto {
  @ApiProperty({ example: 'pay-1' })
  id!: string;

  @ApiProperty({ enum: PaymentStatus })
  status!: PaymentStatus;

  @ApiProperty({ example: 12500 })
  amount!: number;

  @ApiProperty({ enum: CurrencyCode })
  currency!: CurrencyCode;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Public-facing provider reference when present',
  })
  providerRef?: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ nullable: true })
  expiresAt?: string | null;
}

/** Provider-confirmed or in-flight refund amounts visible to the customer. */
export class CustomerOrderRefundSummaryDto {
  @ApiProperty({ example: 'ref-1' })
  id!: string;

  @ApiProperty({ enum: RefundStatus })
  status!: RefundStatus;

  @ApiProperty({ example: 2500 })
  amount!: number;

  @ApiProperty({ enum: CurrencyCode })
  currency!: CurrencyCode;

  @ApiPropertyOptional({ nullable: true })
  reason?: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class CustomerOrderCampaignAttributionDto {
  @ApiProperty({ example: 'camp-1' })
  id!: string;

  @ApiProperty({ example: 'School Fundraiser' })
  title!: string;

  @ApiProperty({ example: 'school-fundraiser' })
  slug!: string;
}

/**
 * Explicit customer order-detail contract (TTW-033).
 * Never includes provider raw events, idempotency keys, internal notes,
 * organizer economics, or the mutable Address relation.
 */
export class CustomerOrderDetailDto {
  @ApiProperty({
    example: CUSTOMER_ORDER_DETAIL_POLICY_VERSION,
    description: 'Interim policy / response contract version',
  })
  policyVersion!: string;

  @ApiProperty({ example: 'order-1' })
  id!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus!: PaymentStatus;

  @ApiProperty({ enum: CurrencyCode })
  currency!: CurrencyCode;

  @ApiProperty({ example: 10000 })
  subtotalAmount!: number;

  @ApiProperty({ example: 2500 })
  shippingFee!: number;

  @ApiProperty({ example: 0 })
  discountAmount!: number;

  @ApiPropertyOptional({ nullable: true, example: 750 })
  vatAmount?: number | null;

  @ApiProperty({ example: 12500 })
  totalAmount!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  expiresAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Order-level Paystack reference when set',
  })
  paymentReference?: string | null;

  @ApiProperty({ type: [CustomerOrderItemDetailDto] })
  items!: CustomerOrderItemDetailDto[];

  @ApiProperty({ type: CustomerOrderShippingSnapshotDto })
  shipping!: CustomerOrderShippingSnapshotDto;

  @ApiProperty({ type: [CustomerOrderPaymentSummaryDto] })
  payments!: CustomerOrderPaymentSummaryDto[];

  @ApiProperty({ type: [CustomerOrderRefundSummaryDto] })
  refunds!: CustomerOrderRefundSummaryDto[];

  @ApiProperty({
    example: 0,
    description: 'Sum of SUCCEEDED refund amounts (major units)',
  })
  refundedAmountConfirmed!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Campaign id when this is a fundraiser order',
  })
  campaignId?: string | null;

  @ApiPropertyOptional({
    type: CustomerOrderCampaignAttributionDto,
    nullable: true,
  })
  campaign?: CustomerOrderCampaignAttributionDto | null;

  @ApiProperty({
    description:
      'True when the server allows starting or continuing payment for this owned order',
  })
  paymentRetryEligible!: boolean;

  @ApiPropertyOptional({
    type: CustomerShipmentSummaryDto,
    nullable: true,
    description:
      'Customer-safe shipment summary + timeline when an active outbound shipment exists (TTW-040)',
  })
  shipment?: CustomerShipmentSummaryDto | null;

  @ApiPropertyOptional({
    nullable: true,
    example: CUSTOMER_SHIPMENT_ABSENT_MESSAGE,
    description:
      'Honest absent-state copy when no shipment exists; null when shipment is present',
  })
  shipmentPlaceholder?: string | null;

  @ApiProperty({
    description:
      'Server-authoritative cancel/refund/return eligibility (TTW-041). Clients must not invent eligibility.',
    type: Object,
  })
  resolution!: {
    policyVersion: string;
    cancellation: {
      allowed: boolean;
      code: string;
      message: string;
    };
    refund: {
      allowed: boolean;
      code: string;
      message: string;
    };
    return: {
      allowed: boolean;
      code: string;
      message: string;
    };
    shipmentExceptionIsNotRemedy: {
      allowed: boolean;
      code: string;
      message: string;
    };
  };
}
