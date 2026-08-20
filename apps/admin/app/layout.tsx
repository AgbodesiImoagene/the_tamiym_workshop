import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Toaster, TooltipProvider } from '@tamiym/ui';

export const metadata: Metadata = {
  title: 'Tamiym Admin',
  description: 'Admin dashboard for orders, products, fundraising operations, and analytics.',
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
    <html lang="en" data-scroll-behavior="smooth" className="font-sans">
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
