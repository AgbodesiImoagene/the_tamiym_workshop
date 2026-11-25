'use client';

import { avatarSrc } from '@/lib/avatar';
import { cn } from '@tamiym/ui';
import { useState } from 'react';

interface UserAvatarProps {
  /** Shown while there is no picture, and behind it while it loads or if it fails. */
  initials: string;
  /** From `/auth/me`. Absent when the user has no picture. */
  avatarVersion?: string;
  alt?: string;
  className?: string;
  initialsClassName?: string;
}

/**
 * Round profile picture, or the initials when there is none (TTW-263). Used by the sidebar,
 * Profile and Settings.
 */
export function UserAvatar({
  initials,
  avatarVersion,
  alt = '',
  className,
  initialsClassName,
}: UserAvatarProps) {
  // Remember which version failed, so a new upload gets a fresh try.
  const [failedVersion, setFailedVersion] = useState<string | undefined>();
  const src =
    avatarVersion && avatarVersion !== failedVersion ? avatarSrc(avatarVersion) : undefined;

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-white/20',
        className
      )}
    >
      <span className={cn('font-semibold', initialsClassName)}>{initials}</span>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route
        <img
          src={src}
          alt={alt}
          onError={() => setFailedVersion(avatarVersion)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
    </span>
  );
}
