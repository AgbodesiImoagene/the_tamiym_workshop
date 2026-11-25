'use client';

import { UserAvatar } from '@/components/user-avatar';
import type { User } from '@/lib/auth';
import {
  AVATAR_ACCEPT_ATTRIBUTE,
  prepareAvatarFile,
  removeAvatar,
  uploadAvatar,
} from '@/lib/avatar';
import { authMeQueryOptions, displayNameOf, useCurrentUser } from '@/lib/current-user';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

interface ProfilePictureFieldProps {
  /** "Upload Profile Picture" on Profile, "Update Profile Picture" on Settings (Figma). */
  buttonLabel: string;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message ? message : 'Could not update your picture.';
}

/** Round picture with its upload and remove buttons (TTW-263). */
export function ProfilePictureField({ buttonLabel }: ProfilePictureFieldProps) {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const name = displayNameOf(user) ?? '';
  const initials = name.slice(0, 2).toUpperCase();

  function setAvatarVersion(avatarVersion: string | undefined) {
    queryClient.setQueryData<User>(authMeQueryOptions.queryKey, (current) => {
      if (!current) return current;
      const next: User = { ...current };
      if (avatarVersion) next.avatarVersion = avatarVersion;
      else delete next.avatarVersion;
      return next;
    });
  }

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    setError(null);
    setBusy('upload');
    try {
      const file = await prepareAvatarFile(chosen);
      const { avatarVersion } = await uploadAvatar(file);
      setAvatarVersion(avatarVersion);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    setError(null);
    setBusy('remove');
    try {
      await removeAvatar();
      setAvatarVersion(undefined);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <UserAvatar
        initials={initials}
        avatarVersion={user?.avatarVersion}
        alt={name ? `${name}'s profile picture` : 'Profile picture'}
        className="h-[120px] w-[120px] bg-black/10"
        initialsClassName="text-3xl text-black/70"
      />
      <div className="flex flex-col items-center gap-2 sm:items-start">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={busy !== null || !user}
            onClick={() => fileInput.current?.click()}
            className="h-8 min-w-[178px] rounded-lg border border-black/50 bg-accent px-4 text-sm font-bold text-[#004385] disabled:opacity-60"
          >
            {busy === 'upload' ? 'Uploading...' : buttonLabel}
          </button>
          {user?.avatarVersion ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void onRemove()}
              className="h-8 rounded-lg border border-black/30 px-4 text-sm font-medium text-black disabled:opacity-60"
            >
              {busy === 'remove' ? 'Removing...' : 'Remove picture'}
            </button>
          ) : null}
        </div>
        <p className="text-xs text-black/60">JPEG, PNG or WebP, up to 5 MB.</p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={AVATAR_ACCEPT_ATTRIBUTE}
        aria-label="Profile picture file"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => void onPick(event)}
      />
    </div>
  );
}
