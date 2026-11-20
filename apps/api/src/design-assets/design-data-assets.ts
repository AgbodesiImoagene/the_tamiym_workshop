/** Deepest nesting walked in a design document. Fabric JSON is a few levels deep. */
const MAX_DEPTH = 24;

/**
 * Ids of the design assets (customer uploads) that a design uses (TTW-234).
 *
 * An image layer stores `data.designAssetId`. Only that key counts, wherever it sits, and
 * only a non-empty string is accepted: words in a text layer or odd values are ignored.
 * `designData` is client supplied, so the walk is bounded in depth.
 */
export function collectDesignAssetIds(designData: unknown): Set<string> {
  const ids = new Set<string>();
  const walk = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'designAssetId') {
        if (typeof value === 'string' && value.length > 0) ids.add(value);
        continue;
      }
      walk(value, depth + 1);
    }
  };
  walk(designData, 0);
  return ids;
}
