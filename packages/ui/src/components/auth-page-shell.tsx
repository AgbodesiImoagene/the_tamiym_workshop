import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';

interface AuthPageShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  meta?: ReactNode;
  hero?: ReactNode;
  variant?: 'light' | 'dark';
  cardWidthClassName?: string;
}

const backgroundClasses = {
  light: 'bg-linear-to-b from-primary-50 via-background to-background',
  dark: 'bg-linear-to-b from-slate-950 via-slate-900 to-primary',
} as const;

export function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
  meta,
  hero,
  variant = 'light',
  cardWidthClassName = 'max-w-md',
}: AuthPageShellProps) {
  return (
    <div
      className={cn(
        'flex min-h-screen items-center justify-center px-4 py-10',
        backgroundClasses[variant]
      )}
    >
      <div
        className={cn(
          'grid w-full gap-8',
          hero ? 'max-w-5xl lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center' : cardWidthClassName
        )}
      >
        {hero ? <div className="hidden lg:block">{hero}</div> : null}

        <Card
          className={cn(
            'w-full rounded-[1.75rem] shadow-sm',
            variant === 'dark'
              ? 'border-white/10 bg-white shadow-xl shadow-slate-950/20'
              : 'border-border/70 bg-white'
          )}
        >
          <CardHeader className="space-y-4 pb-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                {eyebrow}
              </p>
              <CardTitle className="text-3xl normal-case tracking-[-0.03em] text-foreground">
                {title}
              </CardTitle>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
            {meta}
          </CardHeader>

          <Separator />

          <CardContent className="pt-6">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
