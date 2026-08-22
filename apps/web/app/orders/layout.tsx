import type { Metadata } from 'next';
import { noIndexMetadata } from '@/lib/metadata';

export const metadata: Metadata = noIndexMetadata('Order', '/orders');

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
