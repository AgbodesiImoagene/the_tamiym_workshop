import type { Metadata } from 'next';
import { noIndexMetadata } from '@/lib/metadata';

export const metadata: Metadata = noIndexMetadata('Reset your password', '/auth/forgot-password');

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
