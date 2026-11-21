/**
 * TTW-103: what happens on the canvas when a font arrives. A text is first measured with the
 * fallback font; once the real font is there the canvas clears the old measurements, measures
 * again, tells the editor the new size (without adding an undo step) and lets the thumbnail
 * wait for all of that.
 */
import { act, render, waitFor } from '@testing-library/react';
import type { MutableRefObject } from 'react';

const clearFontCache = jest.fn();

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
    toObject(props: string[] = []) {
      // Fabric does not serialise its redraw flag.
      const { dirty: _dirty, ...own } = this;
      void _dirty;
      const plain = JSON.parse(JSON.stringify(own));
      if (!props.includes('data')) delete plain.data;
      return plain;
    }
    toJSON() {
      return this.toObject();
    }
  }

  class FakeText extends FakeObject {
    constructor(text: string, opts: Record<string, unknown>) {
      super({ ...opts, type: 'i-text', text });
      this.initDimensions();
    }
    initDimensions() {
      this.width = (globalThis as { __fontArrived?: boolean }).__fontArrived ? 200 : 100;
    }
    setCoords = jest.fn();
  }

  class FakeCanvas {
    objects: FakeObject[] = [];
    handlers: Record<string, Handler[]> = {};
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
        this.fire('object:removed');
      });
    }
    getObjects() {
      return [...this.objects];
    }
    getActiveObjects() {
      return [];
    }
    setActiveObject() {}
    discardActiveObject() {}
    sendObjectToBack = jest.fn();
    requestRenderAll = jest.fn();
    renderAll = jest.fn();
    dispose = jest.fn();
    toDataURL = jest.fn();
    toJSON() {
      return { version: 'test', objects: this.objects.map((o) => o.toJSON()) };
    }
    constructor() {
      (globalThis as { __fakeCanvas?: FakeCanvas }).__fakeCanvas = this;
    }
  }

  return {
    Canvas: FakeCanvas,
    Rect: FakeObject,
    IText: FakeText,
    cache: {
      clearFontCache: (family: string) =>
        (globalThis as { __clearFontCache?: (f: string) => void }).__clearFontCache?.(family),
    },
    util: {
      enlivenObjects: jest.fn(async (items: Record<string, unknown>[]) =>
        items.map((o) => new FakeText(String(o.text ?? ''), o))
      ),
    },
  };
});

import WorkshopCanvas from '@/components/workshop/WorkshopCanvas';
import type { WorkshopCanvasControls } from '@/components/workshop/WorkshopCanvas';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getCanvas = (): any => (globalThis as any).__fakeCanvas;

/** `document.fonts.load` that only answers when the test lets it. */
function controlledFontLoads() {
  const waiting: Array<() => void> = [];
  const load = jest.fn(
    () =>
      new Promise<unknown[]>((resolve) => {
        waiting.push(() => resolve([]));
      })
  );
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load, ready: Promise.resolve() },
  });
  return {
    load,
    /** The font arrives: every load that is waiting answers. */
    arrive({ resize = true } = {}) {
      (globalThis as { __fontArrived?: boolean }).__fontArrived = resize;
      waiting.splice(0).forEach((answer) => answer());
    },
  };
}

async function setup(objects: Record<string, unknown>[] = []) {
  const controlRef: MutableRefObject<WorkshopCanvasControls | null> = { current: null };
  const onLayersChange = jest.fn();
  const onHistoryChange = jest.fn();
  render(
    <WorkshopCanvas
      viewKey="front"
      printArea={null}
      templateLayers={[]}
      activeEffects={[]}
      fabricJson={{ objects }}
      onLayersChange={onLayersChange}
      onHistoryChange={onHistoryChange}
      controlRef={controlRef}
    />
  );
  await waitFor(() => expect(controlRef.current).not.toBeNull());
  const controls = controlRef.current as WorkshopCanvasControls;
  const lastWidth = () =>
    (onLayersChange.mock.calls.at(-1)?.[0].objects as { width?: number }[] | undefined)?.[0]?.width;
  return { controls, onLayersChange, onHistoryChange, lastWidth };
}

const montserrat = { type: 'i-text', text: 'Hello', fontFamily: 'Montserrat' };

describe('a font arrives after the text is on the canvas', () => {
  beforeEach(() => {
    (globalThis as { __fontArrived?: boolean }).__fontArrived = false;
    (globalThis as { __clearFontCache?: (f: string) => void }).__clearFontCache = clearFontCache;
    clearFontCache.mockClear();
    delete (globalThis as { __fakeCanvas?: unknown }).__fakeCanvas;
  });

  it('measures a text added by the customer again, with the font cache cleared', async () => {
    const fonts = controlledFontLoads();
    const { controls } = await setup();
    await act(() => controls.addText(montserrat));
    expect(getCanvas().objects[0].width).toBe(100);

    await act(async () => {
      fonts.arrive();
      await controls.fontsReady();
    });

    expect(clearFontCache).toHaveBeenCalledWith('Montserrat');
    expect(getCanvas().objects[0].width).toBe(200);
  });

  it('tells the editor the new size, and the sizes it saved are the real ones', async () => {
    const fonts = controlledFontLoads();
    const { controls, lastWidth } = await setup();
    await act(() => controls.addText(montserrat));
    expect(lastWidth()).toBe(100);

    await act(async () => {
      fonts.arrive();
      await controls.fontsReady();
    });
    expect(lastWidth()).toBe(200);
  });

  it('reports nothing when the font arrives and the size does not change', async () => {
    const fonts = controlledFontLoads();
    const { controls, onLayersChange } = await setup();
    await act(() => controls.addText(montserrat));
    const reports = onLayersChange.mock.calls.length;

    await act(async () => {
      fonts.arrive({ resize: false });
      await controls.fontsReady();
    });
    expect(onLayersChange.mock.calls.length).toBe(reports);
  });

  it('keeps the new size out of the undo history', async () => {
    const fonts = controlledFontLoads();
    const { controls, onHistoryChange } = await setup();
    await act(() => controls.addText(montserrat));
    await act(async () => {
      fonts.arrive();
      await controls.fontsReady();
    });
    expect(onHistoryChange.mock.calls.at(-1)?.[0]).toMatchObject({ canUndo: true });

    // One undo takes back the added text and leaves nothing more to undo: the new size
    // was not recorded as a step of its own.
    await act(async () => {
      await controls.undo();
    });
    expect(onHistoryChange.mock.calls.at(-1)?.[0]).toMatchObject({
      canUndo: false,
      canRedo: true,
    });
  });

  it('measures again a text that was saved with the design', async () => {
    const fonts = controlledFontLoads();
    const { controls, lastWidth } = await setup([{ ...montserrat, width: 100 }]);
    expect(getCanvas().objects[0].width).toBe(100);

    await act(async () => {
      fonts.arrive();
      await controls.fontsReady();
    });
    expect(clearFontCache).toHaveBeenCalledWith('Montserrat');
    expect(getCanvas().objects[0].width).toBe(200);
    expect(lastWidth()).toBe(200);
  });

  it('draws a text restored by undo again as well', async () => {
    const fonts = controlledFontLoads();
    const { controls } = await setup();
    await act(() => controls.addText(montserrat));
    await act(() => controls.addText({ ...montserrat, text: 'Second' }));
    await act(async () => {
      fonts.arrive();
      await controls.fontsReady();
    });
    const loadsBefore = fonts.load.mock.calls.length;

    // Undo the second text: the first one is restored from the history.
    (globalThis as { __fontArrived?: boolean }).__fontArrived = false;
    await act(async () => {
      await controls.undo();
    });
    expect(fonts.load.mock.calls.length).toBeGreaterThan(loadsBefore);
    expect(getCanvas().objects).toHaveLength(1);
    expect(getCanvas().objects[0].width).toBe(100);

    await act(async () => {
      fonts.arrive();
      await controls.fontsReady();
    });
    expect(getCanvas().objects[0].width).toBe(200);
  });

  it('fontsReady waits for a font that is still downloading, and resolves at once otherwise', async () => {
    const fonts = controlledFontLoads();
    const { controls } = await setup();
    await expect(controls.fontsReady()).resolves.toBeUndefined();

    await act(() => controls.addText(montserrat));
    let ready = false;
    const waiting = controls.fontsReady().then(() => {
      ready = true;
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(ready).toBe(false);

    await act(async () => {
      fonts.arrive();
      await waiting;
    });
    expect(ready).toBe(true);
  });
});
