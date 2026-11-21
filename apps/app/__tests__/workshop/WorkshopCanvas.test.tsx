/**
 * WorkshopCanvas tests use a mocked Fabric.js module to avoid the DOM canvas
 * dependency. Compatible with fabric v7 Promise-based Image.fromURL / loadFromJSON.
 */

import { render, waitFor } from '@testing-library/react';
import type { TemplateLayer, PrintArea } from '@/lib/designs';

const mockImage = {
  set: jest.fn(),
  filters: [] as unknown[],
  applyFilters: jest.fn(),
  toJSON: jest.fn().mockReturnValue({}),
  width: 100,
  height: 100,
};

jest.mock('fabric', () => ({
  Canvas: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    remove: jest.fn(),
    getObjects: jest.fn().mockReturnValue([]),
    sendObjectToBack: jest.fn(),
    sendToBack: jest.fn(),
    renderAll: jest.fn(),
    requestRenderAll: jest.fn(),
    loadFromJSON: jest.fn().mockResolvedValue(undefined),
    toJSON: jest.fn().mockReturnValue({ objects: [] }),
    toDataURL: jest.fn().mockReturnValue('data:image/png;base64,'),
    on: jest.fn(),
    off: jest.fn(),
    dispose: jest.fn(),
  })),
  FabricImage: {
    fromURL: jest.fn().mockResolvedValue(mockImage),
  },
  Image: {
    fromURL: jest.fn().mockResolvedValue(mockImage),
    filters: {
      BlendColor: jest.fn().mockImplementation(() => ({})),
    },
  },
  filters: {
    BlendColor: jest.fn().mockImplementation(() => ({})),
  },
  Rect: jest.fn().mockImplementation(() => ({})),
  IText: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    toJSON: jest.fn().mockReturnValue({}),
  })),
}));

import WorkshopCanvas from '@/components/workshop/WorkshopCanvas';

const SAMPLE_LAYER: TemplateLayer = {
  id: 'layer-1',
  key: 'base',
  displayName: 'Base',
  layerType: 'IMAGE',
  imageUrl: 'https://cdn.example.com/base.png',
  zIndex: 0,
  blendMode: 'NORMAL',
  opacity: 1,
  meta: null,
};

const SAMPLE_PRINT_AREA: PrintArea = {
  id: 'pa-1',
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.8,
  rotationAllowed: true,
  maxLayers: null,
  maxColors: null,
};

describe('WorkshopCanvas', () => {
  it('renders a canvas element', () => {
    const { container } = render(
      <WorkshopCanvas
        viewKey="front"
        printArea={SAMPLE_PRINT_AREA}
        templateLayers={[SAMPLE_LAYER]}
        activeEffects={[]}
        fabricJson={{ objects: [] }}
      />
    );
    expect(container.querySelector('canvas')).toBeTruthy();
  });

  // TTW-105: Fabric 7 centres an object on its left and top unless told otherwise. The product
  // photo and the print-area clip are placed by their top-left corner (0, 0 and x, y).
  describe('placing by the top-left corner', () => {
    beforeEach(() => {
      mockImage.set.mockClear();
      jest.requireMock('fabric').Rect.mockClear();
    });

    it('anchors the product photo at its top-left corner', async () => {
      render(
        <WorkshopCanvas
          viewKey="front"
          printArea={null}
          templateLayers={[SAMPLE_LAYER]}
          activeEffects={[]}
          fabricJson={{ objects: [] }}
        />
      );
      await waitFor(() => expect(mockImage.set).toHaveBeenCalled());
      expect(mockImage.set).toHaveBeenCalledWith(
        expect.objectContaining({ left: 0, top: 0, originX: 'left', originY: 'top' })
      );
    });

    it('anchors the print-area clip at its top-left corner', async () => {
      render(
        <WorkshopCanvas
          viewKey="front"
          printArea={SAMPLE_PRINT_AREA}
          templateLayers={[]}
          activeEffects={[]}
          fabricJson={{ objects: [] }}
        />
      );
      const RectMock = jest.requireMock('fabric').Rect;
      await waitFor(() => expect(RectMock).toHaveBeenCalled());
      expect(RectMock).toHaveBeenCalledWith(
        expect.objectContaining({ left: 60, top: 60, originX: 'left', originY: 'top' })
      );
    });
  });
});
