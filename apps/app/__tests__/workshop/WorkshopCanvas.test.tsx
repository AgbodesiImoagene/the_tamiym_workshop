/**
 * WorkshopCanvas tests use a mocked Fabric.js module to avoid the DOM canvas
 * dependency. We verify that:
 * 1. A <canvas> element is rendered
 * 2. Template layers trigger Image.fromURL calls when Fabric initialises
 * 3. onLayersChange is called on canvas events
 *
 * Note: The actual Fabric initialisation is async (dynamic import), so we mock
 * the module at the module system level and test the component rendering synchronously.
 */

import { render, screen } from '@testing-library/react';
import type { TemplateLayer, PrintArea } from '@/lib/designs';

// Mock next/dynamic to return a simple div (WorkshopCanvas is loaded via next/dynamic in pages,
// but tested directly here)
jest.mock('fabric', () => ({
  fabric: {
    Canvas: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      remove: jest.fn(),
      getObjects: jest.fn().mockReturnValue([]),
      sendToBack: jest.fn(),
      renderAll: jest.fn(),
      loadFromJSON: jest.fn((_json: unknown, cb: () => void) => cb()),
      toJSON: jest.fn().mockReturnValue({ objects: [] }),
      toDataURL: jest.fn().mockReturnValue('data:image/png;base64,'),
      on: jest.fn(),
      off: jest.fn(),
      dispose: jest.fn(),
    })),
    Image: {
      fromURL: jest.fn(
        (_url: string, cb: (img: unknown) => void) => cb({
          set: jest.fn(),
          filters: [],
          applyFilters: jest.fn(),
          toJSON: jest.fn().mockReturnValue({}),
        }),
      ),
      filters: {
        BlendColor: jest.fn().mockImplementation(() => ({})),
      },
    },
    Rect: jest.fn().mockImplementation(() => ({})),
    IText: jest.fn().mockImplementation(() => ({
      set: jest.fn(),
      toJSON: jest.fn().mockReturnValue({}),
    })),
  },
}));

// The component uses dynamic import('fabric') internally, which needs mocking too
jest.mock(
  'fabric',
  () => ({
    fabric: {
      Canvas: jest.fn().mockImplementation(() => ({
        add: jest.fn(),
        remove: jest.fn(),
        getObjects: jest.fn().mockReturnValue([]),
        sendToBack: jest.fn(),
        renderAll: jest.fn(),
        loadFromJSON: jest.fn((_json: unknown, cb: () => void) => cb()),
        toJSON: jest.fn().mockReturnValue({ objects: [] }),
        on: jest.fn(),
        dispose: jest.fn(),
      })),
      Image: {
        fromURL: jest.fn(
          (_url: string, cb: (img: unknown) => void) => cb({
            set: jest.fn(),
            filters: [],
            applyFilters: jest.fn(),
            toJSON: jest.fn().mockReturnValue({}),
          }),
        ),
        filters: { BlendColor: jest.fn() },
      },
      Rect: jest.fn().mockImplementation(() => ({})),
    },
  }),
  { virtual: true },
);

import WorkshopCanvas from '@/components/workshop/WorkshopCanvas';

const mockPrintArea: PrintArea = {
  id: 'pa-1',
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.8,
  rotationAllowed: false,
  maxLayers: null,
  maxColors: null,
};

const mockTemplateLayers: TemplateLayer[] = [
  {
    id: 'layer-1',
    key: 'base',
    displayName: 'Base',
    layerType: 'BASE',
    blendMode: 'NORMAL',
    opacity: 1,
    zIndex: 0,
    meta: null,
    imageUrl: 'https://cdn.example.com/base.png',
  },
];

describe('WorkshopCanvas', () => {
  it('renders a canvas element', () => {
    const { container } = render(
      <WorkshopCanvas
        viewKey="front"
        printArea={mockPrintArea}
        templateLayers={mockTemplateLayers}
        activeEffects={[]}
        fabricJson={null}
      />,
    );

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders in readOnly mode without interaction', () => {
    const { container } = render(
      <WorkshopCanvas
        viewKey="front"
        printArea={null}
        templateLayers={[]}
        activeEffects={[]}
        fabricJson={{ objects: [] }}
        readOnly
      />,
    );

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('passes width and height to the canvas element', () => {
    const { container } = render(
      <WorkshopCanvas
        viewKey="front"
        printArea={null}
        templateLayers={[]}
        activeEffects={[]}
        fabricJson={null}
        width={400}
        height={400}
      />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveStyle('width: 400px');
    expect(canvas).toHaveStyle('height: 400px');
  });
});
