import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Toaster, TooltipProvider } from '@tamiym/ui';

export const metadata: Metadata = {
  title: 'Tamiym Customer App',
  description:
    'Customer dashboard for product discovery, campaign participation, and order tracking.',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
