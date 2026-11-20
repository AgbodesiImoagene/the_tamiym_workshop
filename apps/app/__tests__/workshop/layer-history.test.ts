/**
 * TTW-102: undo/redo history of the user layers of one view.
 * Snapshots are opaque strings (the serialised user objects).
 */
import { createLayerHistory } from '@/components/workshop/layer-history';

describe('createLayerHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const history = createLayerHistory('a');
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  it('undoes to the previous snapshot and redoes to the next one', () => {
    const history = createLayerHistory('a');
    history.push('b');
    history.push('c');

    expect(history.undo()).toBe('b');
    expect(history.undo()).toBe('a');
    expect(history.undo()).toBeNull();
    expect(history.canRedo()).toBe(true);
    expect(history.redo()).toBe('b');
    expect(history.redo()).toBe('c');
    expect(history.redo()).toBeNull();
  });

  it('drops the redo branch when a new change is pushed after an undo', () => {
    const history = createLayerHistory('a');
    history.push('b');
    history.undo();
    history.push('c');

    expect(history.canRedo()).toBe(false);
    expect(history.undo()).toBe('a');
  });

  it('ignores a snapshot identical to the current one', () => {
    const history = createLayerHistory('a');
    history.push('a');
    expect(history.canUndo()).toBe(false);
  });

  it('keeps at most `limit` undo steps', () => {
    const history = createLayerHistory('0', 3);
    for (let i = 1; i <= 10; i += 1) history.push(String(i));

    const seen: string[] = [];
    for (let step = history.undo(); step !== null; step = history.undo()) seen.push(step);
    expect(seen).toEqual(['9', '8', '7']);
  });
});
