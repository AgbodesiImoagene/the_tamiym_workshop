/**
 * Design thumbnails (TTW-237). The picture of a design contains the customer's images, so
 * it lives in the PRIVATE bucket under one fixed key per design and is served by the API.
 * `Design.thumbnailUrl` is only the stable API path (relative to the API base, which
 * already ends with `/v1`): never a storage address, and never set by a client.
 */
export const DESIGN_THUMBNAIL_CONTENT_TYPE = 'image/webp';

export function designThumbnailKey(designId: string): string {
  return `design-thumbnails/${designId}`;
}

export function designThumbnailPath(designId: string): string {
  return `/designs/${designId}/thumbnail`;
}
