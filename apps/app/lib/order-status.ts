import { OrderStatus, PaymentStatus } from '@tamiym/types';

export interface OrderStatusPresentation {
  title: string;
  body: string;
  tone: 'success' | 'danger' | 'warning' | 'neutral' | 'info';
}

/**
 * Shared customer-facing order/payment status copy (TTW-033).
 * Used by confirmation and account order detail.
 */
export function getOrderStatusPresentation(
  paymentStatus?: PaymentStatus,
  orderStatus?: OrderStatus
): OrderStatusPresentation {
  if (paymentStatus === PaymentStatus.SUCCEEDED) {
    if (orderStatus === OrderStatus.DELIVERED) {
      return {
        title: 'Delivered',
        body: 'Your order has been delivered. Thank you for shopping with Tamiym Workshop.',
        tone: 'success',
      };
    }
    if (orderStatus === OrderStatus.FULFILLED) {
      return {
        title: 'On the way',
        body: 'Your order has been fulfilled and is heading to fulfillment/shipping.',
        tone: 'info',
      };
    }
    if (orderStatus === OrderStatus.PROCESSING) {
      return {
        title: 'In production',
        body: 'Payment is confirmed and your order is being prepared.',
        tone: 'info',
      };
    }
    if (orderStatus === OrderStatus.PARTIALLY_REFUNDED) {
      return {
        title: 'Partially refunded',
        body: 'A partial refund has been confirmed for this order. Remaining fulfillment continues as shown below.',
        tone: 'warning',
      };
    }
    if (orderStatus === OrderStatus.REFUNDED) {
      return {
        title: 'Refunded',
        body: 'This order has been fully refunded.',
        tone: 'neutral',
      };
    }
    return {
      title: 'Payment confirmed',
      body: 'Your payment was received successfully. We have your order and it is now in our fulfillment flow.',
      tone: 'success',
    };
  }

  if (paymentStatus === PaymentStatus.FAILED) {
    return {
      title: 'Payment failed',
      body: 'The payment attempt did not complete. You can retry payment when it is still eligible.',
      tone: 'danger',
    };
  }

  if (orderStatus === OrderStatus.CANCELLED) {
    return {
      title: 'Order cancelled',
      body: 'This order is no longer active. Create a new order from your cart when you are ready.',
      tone: 'neutral',
    };
  }

  return {
    title: 'Waiting for payment confirmation',
    body: 'We are still checking the payment status for this order. Paystack and the webhook can take a moment to settle.',
    tone: 'warning',
  };
}

export function formatOrderStatusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}
