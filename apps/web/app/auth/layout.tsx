import type { Metadata } from 'next';
import { noIndexMetadata } from '@/lib/metadata';

export const metadata: Metadata = noIndexMetadata('Account access', '/auth');

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
