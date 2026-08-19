import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tamiym Workshop',
  description:
    'Tamiym Workshop helps teams, communities, and organizers launch branded merchandise and fundraising campaigns.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
