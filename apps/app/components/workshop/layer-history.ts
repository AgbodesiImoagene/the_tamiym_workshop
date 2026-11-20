/**
 * Undo/redo history of the user layers of one view (TTW-102).
 * A snapshot is an opaque string, the serialised user objects. The history always
 * holds the current snapshot, so `undo` returns the one to restore.
 */
export interface LayerHistory {
  /** Record a new state. Ignored when equal to the current one. Drops the redo branch. */
  push: (snapshot: string) => void;
  /** Step back; returns the snapshot to restore, or null when there is none. */
  undo: () => string | null;
  /** Step forward; returns the snapshot to restore, or null when there is none. */
  redo: () => string | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const DEFAULT_HISTORY_LIMIT = 50;

export function createLayerHistory(
  initial: string,
  limit: number = DEFAULT_HISTORY_LIMIT
): LayerHistory {
  let snapshots: string[] = [initial];
  let index = 0;

  return {
    push(snapshot) {
      if (snapshots[index] === snapshot) return;
      snapshots = [...snapshots.slice(0, index + 1), snapshot];
      // Keep the current state plus at most `limit` earlier ones.
      if (snapshots.length > limit + 1) snapshots = snapshots.slice(snapshots.length - limit - 1);
      index = snapshots.length - 1;
    },
    undo() {
      if (index === 0) return null;
      index -= 1;
      return snapshots[index];
    },
    redo() {
      if (index >= snapshots.length - 1) return null;
      index += 1;
      return snapshots[index];
    },
    canUndo: () => index > 0,
    canRedo: () => index < snapshots.length - 1,
  };
}
