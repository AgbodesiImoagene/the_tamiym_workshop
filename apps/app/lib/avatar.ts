/**
 * Profile picture helpers (TTW-263).
 *
 * The picture is private: it is read from an authenticated API route, with the session
 * cookie, never from a public storage URL. `avatarVersion` (from `/auth/me`) is in the URL
 * only so the browser fetches again when the picture changes.
 *
 * The browser shrinks a large photo before sending it to save bandwidth. The API checks and
 * compresses again whatever it receives, so nothing here is a security control.
 */
import { API_BASE_URL, apiFetch } from './api';

/** Same limit as the API (`AVATAR_MAX_BYTES`). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
/** Longest side of the picture sent to the API. The API keeps at most 256 px. */
const AVATAR_UPLOAD_MAX_SIDE = 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const AVATAR_PICK_MESSAGE = 'Choose a JPEG, PNG or WebP image.';
export const AVATAR_TOO_BIG_MESSAGE = 'The picture must be smaller than 5 MB.';

export const AVATAR_ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(',');

/** URL of the signed-in user's picture, or undefined when there is none. */
export function avatarSrc(avatarVersion: string | undefined | null): string | undefined {
  return avatarVersion
    ? `${API_BASE_URL}/users/profile/avatar?v=${encodeURIComponent(avatarVersion)}`
    : undefined;
}

/** Shrink to at most 1024 px as WebP. Returns null when the browser cannot do it. */
async function shrink(file: File): Promise<File | null> {
  if (typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= AVATAR_UPLOAD_MAX_SIDE && file.size <= AVATAR_MAX_BYTES) return null;
    const scale = Math.min(1, AVATAR_UPLOAD_MAX_SIDE / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85)
    );
    if (!blob) return null;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/**
 * Check the chosen file and shrink it when the browser can. Throws an `Error` whose message
 * is meant to be shown to the person.
 */
export async function prepareAvatarFile(file: File): Promise<File> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error(AVATAR_PICK_MESSAGE);
  const shrunk = await shrink(file);
  const result = shrunk ?? file;
  if (result.size > AVATAR_MAX_BYTES) throw new Error(AVATAR_TOO_BIG_MESSAGE);
  return result;
}

/** Send the picture. Resolves with the new version of the picture. */
export async function uploadAvatar(file: File): Promise<{ avatarVersion: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiFetch('/users/profile/avatar', { method: 'POST', body: formData });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw {
      message:
        response.status === 413 ? AVATAR_TOO_BIG_MESSAGE : data.message || response.statusText,
      statusCode: response.status,
    };
  }
  return response.json();
}

export async function removeAvatar(): Promise<void> {
  const response = await apiFetch('/users/profile/avatar', { method: 'DELETE' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw { message: data.message || response.statusText, statusCode: response.status };
  }
}
