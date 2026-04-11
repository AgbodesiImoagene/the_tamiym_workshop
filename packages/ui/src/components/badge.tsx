import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type BadgeVariant = 'brand' | 'accent' | 'neutral' | 'danger';

const variantClasses: Record<BadgeVariant, string> = {
  brand: 'bg-primary-50 text-primary-700 border-primary-100',
  accent: 'bg-accent-100 text-primary-900 border-accent-200',
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em]',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
