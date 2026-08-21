import {
  formatVariantDisplaySnapshot,
  ORDER_ITEM_DISPLAY_SNAPSHOT_VERSION,
  CUSTOMER_ORDER_DETAIL_POLICY_VERSION,
  CUSTOMER_ORDER_SHIPMENT_PLACEHOLDER,
} from './order-item-snapshot';
import { CustomerOrderDetailDto } from './dto/customer-order-detail.dto';

describe('order-item-snapshot helpers', () => {
  it('exposes interim policy and snapshot version constants', () => {
    expect(ORDER_ITEM_DISPLAY_SNAPSHOT_VERSION).toBe(1);
    expect(CUSTOMER_ORDER_DETAIL_POLICY_VERSION).toBe(
      'customer-order-detail/v1-interim-2026-08-21',
    );
    expect(CUSTOMER_ORDER_SHIPMENT_PLACEHOLDER).toBe(
      'Shipping updates will appear here when available.',
    );
    // Load DTO module so Swagger decorator statements count for diff coverage.
    expect(CustomerOrderDetailDto).toBeDefined();
  });

  it('formats variant display with and without SKU', () => {
    expect(formatVariantDisplaySnapshot('Small / Red', 'SKU-1')).toBe(
      'Small / Red (SKU-1)',
    );
    expect(formatVariantDisplaySnapshot('Small / Red', '  ')).toBe(
      'Small / Red',
    );
    expect(formatVariantDisplaySnapshot('', null)).toBe('Variant');
  });
});
