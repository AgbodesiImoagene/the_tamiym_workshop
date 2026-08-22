import './globals.css';
import { Toaster, TooltipProvider } from '@tamiym/ui';
import { rootMetadata } from '@/lib/metadata';
import { JsonLd } from '@/components/json-ld';
import { buildGlobalStructuredData } from '@/lib/structured-data/builders';

export const metadata = rootMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-NG">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <JsonLd data={buildGlobalStructuredData()} />
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
