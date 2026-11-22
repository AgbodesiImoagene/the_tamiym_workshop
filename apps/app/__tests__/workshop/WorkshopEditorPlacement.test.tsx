/**
 * TTW-105: a text or an image added from the tools is placed at the centre of the print area,
 * so the customer sees it at once (the canvas shows only the print area). Without a print area
 * nothing changes: the layer keeps its usual starting position.
 */
import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@tamiym/ui';
import WorkshopEditor from '@/components/workshop/WorkshopEditor';
import type { PrintArea, WorkshopContext } from '@/lib/designs';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const mockControls = {
  addText: jest.fn(),
  addImage: jest.fn(),
  deleteSelected: jest.fn(),
  deleteLayer: jest.fn(),
  selectLayer: jest.fn(),
  moveLayer: jest.fn(),
  undo: jest.fn(),
  redo: jest.fn(),
  toDataURL: jest.fn(),
};

jest.mock('next/dynamic', () => () => {
  function FakeCanvas(props: {
    controlRef: { current: unknown };
    onReadyChange: (ready: boolean) => void;
  }) {
    const { controlRef, onReadyChange } = props;
    useEffect(() => {
      controlRef.current = mockControls;
      onReadyChange(true);
      return () => {
        controlRef.current = null;
        onReadyChange(false);
      };
    }, [controlRef, onReadyChange]);
    return <div data-testid="canvas" />;
  }
  return FakeCanvas;
});

jest.mock('@/components/workshop/SharePanel', () => () => null);

jest.mock('@/lib/designs', () => ({
  createDesign: jest.fn(),
  updateDesign: jest.fn(),
  uploadThumbnail: jest.fn(),
  uploadDesignAsset: jest.fn().mockResolvedValue({ designAssetId: 'asset-1' }),
  designAssetFileUrl: (id: string) => `/files/${id}`,
}));

function contextWith(printArea: PrintArea | null): WorkshopContext {
  return {
    product: { id: 'prod-1', name: 'Classic Tee', slug: 'classic-tee', options: [] },
    views: [
      {
        id: 'view-1',
        key: 'front',
        displayName: 'Front',
        sortOrder: 0,
        isDesignable: true,
        isDefault: true,
        printArea,
        templateLayers: [],
        effects: [],
      },
    ],
  };
}

function area(x: number, y: number, width: number, height: number): PrintArea {
  return {
    id: 'pa-1',
    x,
    y,
    width,
    height,
    rotationAllowed: false,
    maxLayers: null,
    maxColors: null,
  };
}

function renderEditor(printArea: PrintArea | null) {
  return render(
    <TooltipProvider>
      <WorkshopEditor workshopContext={contextWith(printArea)} />
    </TooltipProvider>
  );
}

describe('WorkshopEditor placement of new layers', () => {
  beforeEach(() => {
    mockControls.addText.mockReset();
    mockControls.addImage.mockReset();
  });

  it('puts a new text at the centre of the print area', () => {
    renderEditor(area(0.1, 0.2, 0.5, 0.2));
    fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));

    // Canvas of 600 px: x 0.1 + 0.5 / 2 = 0.35 -> 210, y 0.2 + 0.2 / 2 = 0.3 -> 180.
    expect(mockControls.addText).toHaveBeenCalledWith(
      expect.objectContaining({ left: 210, top: 180 })
    );
  });

  it('puts a new image at the centre of the print area', async () => {
    const { container } = renderEditor(area(0.3, 0.3, 0.4, 0.4));
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    const input = container.querySelector<HTMLInputElement>('#image-tool-input')!;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(mockControls.addImage).toHaveBeenCalled());
    expect(mockControls.addImage).toHaveBeenCalledWith(
      expect.objectContaining({ left: 300, top: 300 })
    );
  });

  it('keeps the usual starting position when the view has no print area', () => {
    renderEditor(null);
    fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));
    expect(mockControls.addText).toHaveBeenCalledWith(
      expect.objectContaining({ left: 50, top: 50 })
    );
  });
});
