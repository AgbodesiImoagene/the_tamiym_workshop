/**
 * TTW-104: the editor works out, from the design it holds, which images may print blurry,
 * marks them in the layer list and explains it next to the canvas for the selected one. It
 * never blocks anything.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@tamiym/ui';
import WorkshopEditor from '@/components/workshop/WorkshopEditor';
import type { WorkshopContext } from '@/lib/designs';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

// What the canvas reports, set by each test (a Fabric image keeps its scale in the JSON).
let mockObjects: unknown[] = [];

jest.mock('next/dynamic', () => () => {
  function FakeCanvas(props: {
    onLayersChange: (json: unknown) => void;
    onSelectionChange: (id: string | null) => void;
  }) {
    return (
      <>
        <button type="button" onClick={() => props.onLayersChange({ objects: mockObjects })}>
          Report layers
        </button>
        <button type="button" onClick={() => props.onSelectionChange('img')}>
          Select the image
        </button>
        <button type="button" onClick={() => props.onSelectionChange('txt')}>
          Select the text
        </button>
      </>
    );
  }
  return FakeCanvas;
});

jest.mock('@/components/workshop/SharePanel', () => () => null);
jest.mock('@/lib/designs', () => ({
  createDesign: jest.fn(),
  updateDesign: jest.fn(),
  uploadThumbnail: jest.fn(),
}));

const image = (scale: number) => ({
  type: 'FabricImage',
  scaleX: scale,
  scaleY: scale,
  data: { layerId: 'img', designAssetId: 'a1' },
});
const text = { type: 'IText', text: 'Hello', scaleX: 9, scaleY: 9, data: { layerId: 'txt' } };

const contextWith = (
  printArea: WorkshopContext['views'][number]['printArea']
): WorkshopContext => ({
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
});

const AREA = {
  id: 'pa',
  x: 0.18,
  y: 0.22,
  width: 0.64,
  height: 0.55,
  rotationAllowed: true,
  maxLayers: null,
  maxColors: null,
};

function open(context: WorkshopContext, objects: unknown[]) {
  mockObjects = objects;
  render(
    <TooltipProvider>
      <WorkshopEditor workshopContext={context} />
    </TooltipProvider>
  );
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Report layers' }));
  });
}

const select = (name: string) =>
  act(() => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

describe('WorkshopEditor low-resolution warning', () => {
  it('marks an enlarged image in the layer list and explains it when it is selected', () => {
    open(contextWith(null), [image(3)]);
    expect(screen.getByText('May print blurry')).toBeInTheDocument();
    // Not selected yet: the explanation is only for the selected image.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    select('Select the image');
    expect(screen.getByRole('status')).toHaveTextContent(
      'This image may print blurry. Make it smaller or upload a larger image.'
    );
  });

  it('shows nothing for an image that is dense enough', () => {
    open(contextWith(null), [image(0.25)]);
    expect(screen.queryByText('May print blurry')).not.toBeInTheDocument();
    select('Select the image');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('judges the image against the width of the print area', () => {
    // At the default scale 0.5, a print area 0.64 of the canvas holds 768 source pixels.
    open(contextWith(AREA), [image(0.5)]);
    expect(screen.getByText('May print blurry')).toBeInTheDocument();
  });

  it('never warns about text, whatever its scale', () => {
    open(contextWith(null), [text]);
    expect(screen.queryByText('May print blurry')).not.toBeInTheDocument();
    select('Select the text');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not block saving', () => {
    open(contextWith(null), [image(3)]);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
