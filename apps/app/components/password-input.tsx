'use client';

import { Input } from '@tamiym/ui';
import { forwardRef, useState, type ComponentProps } from 'react';

interface PasswordInputProps extends Omit<ComponentProps<'input'>, 'type'> {
  /** Accessible name of the toggle is "Show <toggleLabel>" / "Hide <toggleLabel>". */
  toggleLabel?: string;
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="m3 3 18 18" /> : null}
    </svg>
  );
}

/**
 * A password field with an eye button that shows or hides what was typed. The value is never
 * touched by the toggle, so it works with React Hook Form's `register`.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ toggleLabel = 'password', className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={className ? `${className} pr-10` : 'pr-10'}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${toggleLabel}`}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <EyeIcon off={visible} />
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';
