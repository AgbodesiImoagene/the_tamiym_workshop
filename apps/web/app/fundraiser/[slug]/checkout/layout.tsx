import type { Metadata } from 'next';
import { noIndexMetadata } from '@/lib/metadata';

export const metadata: Metadata = noIndexMetadata('Checkout', '/fundraiser/checkout');

export default function FundraiserCheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
