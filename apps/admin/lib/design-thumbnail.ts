/**
 * Address to show a design thumbnail (TTW-237). The API stores only a stable path such as
 * `/designs/<id>/thumbnail` (relative to the API base): the picture is private and the API
 * decides who may read it. Anything that is not such a path or an absolute http(s) address
 * (seeded placeholders) is refused, so a stored value can never become a script or a
 * protocol-relative link.
 */
const API_BASE_URL = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

export function designThumbnailSrc(thumbnailUrl: string | null | undefined): string | null {
  const value = thumbnailUrl?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) {
    return `${API_BASE_URL()}${value}`;
  }
  return null;
}
