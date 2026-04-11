import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'flex min-h-28 w-full rounded-xl border border-input bg-white px-3 py-3 text-sm text-foreground shadow-xs outline-hidden transition focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}
