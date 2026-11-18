import type { Metadata } from 'next';
import { noIndexMetadata } from '@/lib/metadata';

// The reset token travels in the URL: never send it on as a referrer (TTW-089).
export const metadata: Metadata = {
  ...noIndexMetadata('Choose a new password', '/reset-password'),
  referrer: 'no-referrer',
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
