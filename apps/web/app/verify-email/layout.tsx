import type { Metadata } from 'next';
import { noIndexMetadata } from '@/lib/metadata';

export const metadata: Metadata = noIndexMetadata('Verify email', '/verify-email');

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
