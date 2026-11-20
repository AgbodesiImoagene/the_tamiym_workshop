/**
 * TTW-102: the controls WorkshopCanvas hands to the editor (add, delete, select,
 * reorder, undo, redo). Fabric.js is replaced by a small in-memory canvas that keeps
 * an object list and fires the same events as the real one.
 */
import { act, render, waitFor } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { designAssetFileUrl, type FabricJson } from '@/lib/designs';

jest.mock('fabric', () => {
  type Handler = (event?: unknown) => void;

  class FakeObject {
    [key: string]: unknown;
    constructor(props: Record<string, unknown>) {
      Object.assign(this, props);
      this.data = { ...((props.data as object | undefined) ?? {}) };
    }
    set(props: Record<string, unknown>) {
      Object.assign(this, props);
    }
    // Like Fabric v6+: only toObject(props) keeps the extra properties, toJSON() drops them.
    toObject(props: string[] = []) {
      const { ...rest } = this;
      const plain = JSON.parse(JSON.stringify(rest));
      if (!props.includes('data')) delete plain.data;
      return plain;
    }
    toJSON() {
      return this.toObject();
    }
  }

  class FakeCanvas {
    objects: FakeObject[] = [];
    active: FakeObject | null = null;
    handlers: Record<string, Handler[]> = {};
    constructor() {
      (globalThis as { __fakeCanvas?: FakeCanvas }).__fakeCanvas = this;
    }
    on(name: string, handler: Handler) {
      (this.handlers[name] ??= []).push(handler);
    }
    off() {}
    fire(name: string) {
      (this.handlers[name] ?? []).forEach((h) => h());
    }
    add(...items: FakeObject[]) {
      items.forEach((o) => {
        this.objects.push(o);
        this.fire('object:added');
      });
    }
    remove(...items: FakeObject[]) {
      items.forEach((o) => {
        this.objects = this.objects.filter((x) => x !== o);
        if (this.active === o) this.active = null;
        this.fire('object:removed');
      });
    }
    getObjects() {
      return [...this.objects];
    }
    // Members of a drag-selection (Fabric's ActiveSelection); null when one object or none.
    members: FakeObject[] | null = null;
    getActiveObject() {
      return this.active;
    }
    getActiveObjects() {
      return this.members ?? (this.active ? [this.active] : []);
    }
    setActiveObject(o: FakeObject) {
      this.active = o;
      this.members = null;
      this.fire('selection:created');
    }
    discardActiveObject() {
      this.active = null;
      this.members = null;
      this.fire('selection:cleared');
    }
    bringObjectForward(o: FakeObject) {
      const i = this.objects.indexOf(o);
      if (i < this.objects.length - 1) {
        [this.objects[i], this.objects[i + 1]] = [this.objects[i + 1], this.objects[i]];
      }
    }
    sendObjectBackwards(o: FakeObject) {
      const i = this.objects.indexOf(o);
      if (i > 0) [this.objects[i], this.objects[i - 1]] = [this.objects[i - 1], this.objects[i]];
    }
    sendObjectToBack = jest.fn();
    requestRenderAll = jest.fn();
    renderAll = jest.fn();
    dispose = jest.fn();
    toDataURL = jest.fn().mockReturnValue('data:image/webp;base64,AAA');
    toJSON() {
      return { version: 'test', objects: this.objects.map((o) => o.toJSON()) };
    }
    async loadFromJSON(json: { objects: Record<string, unknown>[] }) {
      this.objects = json.objects.map((o) => new FakeObject(o));
    }
  }

  class FakeIText extends FakeObject {
    constructor(text: string, opts: Record<string, unknown>) {
      super({ ...opts, type: 'i-text', text });
    }
  }

  return {
    Canvas: FakeCanvas,
    Rect: FakeObject,
    IText: FakeIText,
    FabricImage: {
      fromURL: jest.fn(async (src: string) => new FakeObject({ type: 'image', src })),
    },
    util: {
      enlivenObjects: jest.fn(async (items: Record<string, unknown>[]) =>
        items.map((o) => new FakeObject(o))
      ),
    },
    __FakeObject: FakeObject,
  };
});

import WorkshopCanvas from '@/components/workshop/WorkshopCanvas';
import type { WorkshopCanvasControls } from '@/components/workshop/WorkshopCanvas';
import * as fabricModule from 'fabric';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fake = any;
const getCanvas = (): Fake => (globalThis as { __fakeCanvas?: Fake }).__fakeCanvas;
const FakeObject = (fabricModule as unknown as { __FakeObject: new (p: object) => Fake })
  .__FakeObject;

async function setup(fabricJson: FabricJson | null = { objects: [] }) {
  const controlRef: MutableRefObject<WorkshopCanvasControls | null> = { current: null };
  const onLayersChange = jest.fn();
  const onSelectionChange = jest.fn();
  const onHistoryChange = jest.fn();
  const onReadyChange = jest.fn();

  const { unmount } = render(
    <WorkshopCanvas
      viewKey="front"
      printArea={null}
      templateLayers={[]}
      activeEffects={[]}
      fabricJson={fabricJson}
      onLayersChange={onLayersChange}
      onSelectionChange={onSelectionChange}
      onHistoryChange={onHistoryChange}
      onReadyChange={onReadyChange}
      controlRef={controlRef}
    />
  );
  await waitFor(() => expect(controlRef.current).not.toBeNull());
  const controls = controlRef.current as WorkshopCanvasControls;

  const lastLayers = (): Record<string, unknown>[] =>
    onLayersChange.mock.calls.at(-1)?.[0].objects ?? [];
  const lastHistory = () => onHistoryChange.mock.calls.at(-1)?.[0];
  const text = (label: string) =>
    act(() => controls.addText({ type: 'i-text', text: label, left: 50, top: 50 }));

  return {
    controls,
    onLayersChange,
    onSelectionChange,
    onReadyChange,
    unmount,
    lastLayers,
    lastHistory,
    text,
  };
}

const layerIdOf = (o: Record<string, unknown>) => (o.data as { layerId: string }).layerId;

describe('WorkshopCanvas controls', () => {
  beforeEach(() => {
    delete (globalThis as { __fakeCanvas?: unknown }).__fakeCanvas;
  });

  it('tells the editor when the controls are ready, and when they are gone', async () => {
    const { onReadyChange, unmount } = await setup();
    expect(onReadyChange).toHaveBeenCalledTimes(1);
    expect(onReadyChange).toHaveBeenLastCalledWith(true);

    unmount();
    expect(onReadyChange).toHaveBeenLastCalledWith(false);
  });

  it('adds text to the canvas with a layer id, selected and reported to the editor', async () => {
    const { text, lastLayers } = await setup();
    await text('Hello');

    expect(getCanvas().getObjects()).toHaveLength(1);
    expect(lastLayers()).toHaveLength(1);
    expect(lastLayers()[0]).toMatchObject({ text: 'Hello' });
    expect(layerIdOf(lastLayers()[0])).toEqual(expect.any(String));
    expect(getCanvas().getActiveObject()).toBe(getCanvas().getObjects()[0]);
  });

  it('adds an image and keeps its design asset data next to the layer id', async () => {
    const { controls, lastLayers } = await setup();
    await act(() =>
      controls.addImage({
        type: 'image',
        src: 'https://cdn.example.com/a.png',
        data: { designAssetId: 'asset-1' },
      })
    );

    expect(lastLayers()).toHaveLength(1);
    expect(lastLayers()[0]).toMatchObject({ type: 'image', src: 'https://cdn.example.com/a.png' });
    expect(lastLayers()[0].data).toMatchObject({ designAssetId: 'asset-1' });
    expect(layerIdOf(lastLayers()[0])).toEqual(expect.any(String));
  });

  it('loads a private customer image with credentials and a public one anonymously (TTW-099)', async () => {
    const { controls } = await setup();
    const fromURL = (jest.requireMock('fabric') as { FabricImage: { fromURL: jest.Mock } })
      .FabricImage.fromURL;
    fromURL.mockClear();

    await act(() =>
      controls.addImage({
        type: 'image',
        src: designAssetFileUrl('asset-1'),
        data: { designAssetId: 'asset-1' },
      })
    );
    await act(() =>
      controls.addImage({ type: 'image', src: 'https://cdn.example.com/a.png', data: {} })
    );

    expect(fromURL).toHaveBeenNthCalledWith(1, designAssetFileUrl('asset-1'), {
      crossOrigin: 'use-credentials',
    });
    expect(fromURL).toHaveBeenNthCalledWith(2, 'https://cdn.example.com/a.png', {
      crossOrigin: 'anonymous',
    });
  });

  it('gives a layer id to layers saved before this feature', async () => {
    const { lastLayers } = await setup({ objects: [{ type: 'i-text', text: 'Old' }] });
    await waitFor(() => expect(lastLayers()).toHaveLength(1));
    expect(layerIdOf(lastLayers()[0])).toEqual(expect.any(String));
  });

  it('deletes the selected layer', async () => {
    const { controls, text, lastLayers } = await setup();
    await text('Hello');

    let deleted = false;
    act(() => {
      deleted = controls.deleteSelected();
    });

    expect(deleted).toBe(true);
    expect(getCanvas().getObjects()).toHaveLength(0);
    expect(lastLayers()).toHaveLength(0);
  });

  it('deletes a layer by id even when it is not selected', async () => {
    const { controls, text, lastLayers } = await setup();
    await text('A');
    await text('B');
    const idOfA = layerIdOf(lastLayers()[0]);

    act(() => {
      controls.deleteLayer(idOfA);
    });

    expect(lastLayers().map((o) => o.text)).toEqual(['B']);
  });

  it('does nothing when no layer is selected', async () => {
    const { controls, text, lastLayers } = await setup();
    await text('Hello');
    act(() => getCanvas().discardActiveObject());

    let deleted = true;
    act(() => {
      deleted = controls.deleteSelected();
    });

    expect(deleted).toBe(false);
    expect(lastLayers()).toHaveLength(1);
  });

  it('never deletes a template layer', async () => {
    const { controls } = await setup();
    const template = new FakeObject({ type: 'image', data: { isTemplateLayer: true } });
    act(() => getCanvas().add(template));
    act(() => getCanvas().setActiveObject(template));

    let deleted = true;
    act(() => {
      deleted = controls.deleteSelected();
    });

    expect(deleted).toBe(false);
    expect(getCanvas().getObjects()).toContain(template);
  });

  it('undoes a delete and redoes it, without touching template layers', async () => {
    const { controls, text, lastLayers } = await setup();
    const template = new FakeObject({ type: 'image', data: { isTemplateLayer: true } });
    act(() => getCanvas().add(template));
    await text('Hello');
    const id = layerIdOf(lastLayers()[0]);
    act(() => {
      controls.deleteSelected();
    });
    expect(lastLayers()).toHaveLength(0);

    await act(() => controls.undo());
    expect(lastLayers()).toHaveLength(1);
    expect(layerIdOf(lastLayers()[0])).toBe(id);
    expect(getCanvas().getObjects()).toContain(template);

    await act(() => controls.redo());
    expect(lastLayers()).toHaveLength(0);
    expect(getCanvas().getObjects()).toEqual([template]);
  });

  it('reports whether undo and redo are possible, and drops redo after a new change', async () => {
    const { controls, text, lastHistory } = await setup();
    expect(lastHistory()).toEqual({ canUndo: false, canRedo: false });

    await text('A');
    expect(lastHistory()).toEqual({ canUndo: true, canRedo: false });

    await act(() => controls.undo());
    expect(lastHistory()).toEqual({ canUndo: false, canRedo: true });

    await text('B');
    expect(lastHistory()).toEqual({ canUndo: true, canRedo: false });
  });

  it('moves a layer up and down in the stack', async () => {
    const { controls, text, lastLayers } = await setup();
    await text('A');
    await text('B');
    const idOfA = layerIdOf(lastLayers()[0]);

    act(() => {
      controls.moveLayer(idOfA, 'up');
    });
    expect(lastLayers().map((o) => o.text)).toEqual(['B', 'A']);

    act(() => {
      controls.moveLayer(idOfA, 'down');
    });
    expect(lastLayers().map((o) => o.text)).toEqual(['A', 'B']);
  });

  it('selects a layer by id and reports the selection, then the cleared selection', async () => {
    const { controls, text, lastLayers, onSelectionChange } = await setup();
    await text('A');
    await text('B');
    const idOfA = layerIdOf(lastLayers()[0]);

    act(() => controls.selectLayer(idOfA));
    expect(onSelectionChange).toHaveBeenLastCalledWith(idOfA);

    act(() => getCanvas().discardActiveObject());
    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
  });

  it('refuses an undo when a layer cannot be loaded back, and keeps canvas and history as they were', async () => {
    const { controls, text, lastLayers, lastHistory } = await setup();
    await text('A');
    act(() => {
      controls.deleteSelected();
    });
    // Fabric drops an object it cannot load (for example an image whose URL is gone).
    jest.mocked(fabricModule.util.enlivenObjects).mockResolvedValueOnce([]);

    await act(() => controls.undo());

    expect(getCanvas().getObjects()).toHaveLength(0);
    expect(lastLayers()).toHaveLength(0);
    expect(lastHistory()).toEqual({ canUndo: true, canRedo: false });
  });

  it('ignores changes while an undo is still being applied', async () => {
    const { controls, text, lastLayers } = await setup();
    await text('A');
    await text('B');

    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    jest.mocked(fabricModule.util.enlivenObjects).mockImplementationOnce(async (items) => {
      await gate;
      return items.map((o: object) => new FakeObject(o));
    });

    let undoing!: Promise<void>;
    act(() => {
      undoing = controls.undo();
    });
    let deleted = true;
    act(() => {
      deleted = controls.deleteSelected();
    });
    expect(deleted).toBe(false);

    await act(async () => {
      open();
      await undoing;
    });
    expect(lastLayers().map((o) => o.text)).toEqual(['A']);
  });

  it('reports a drag-selection by its first customer layer and deletes all of it', async () => {
    const { controls, text, lastLayers, onSelectionChange } = await setup();
    await text('A');
    await text('B');
    const [layerA, layerB] = getCanvas().getObjects();

    act(() => {
      getCanvas().members = [layerA, layerB];
      getCanvas().fire('selection:created');
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith(layerIdOf(lastLayers()[0]));

    act(() => {
      controls.deleteSelected();
    });
    expect(lastLayers()).toHaveLength(0);
  });

  it('exposes the canvas picture for the thumbnail', async () => {
    const { controls } = await setup();
    expect(controls.toDataURL({ format: 'webp', quality: 0.8 })).toBe('data:image/webp;base64,AAA');
  });
});
