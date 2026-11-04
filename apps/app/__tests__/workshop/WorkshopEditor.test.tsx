/**
 * TTW-009: auto-save must send the latest design, not the design as it was when the
 * editor mounted (or when the design was first saved).
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@tamiym/ui';
import WorkshopEditor from '@/components/workshop/WorkshopEditor';
import { updateDesign, type Design, type FabricJson, type WorkshopContext } from '@/lib/designs';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

// The real canvas needs Fabric.js; this stand-in reports one layer change per click.
jest.mock('next/dynamic', () => () => {
  function FakeCanvas({ onLayersChange }: { onLayersChange: (json: FabricJson) => void }) {
    return (
      <button
        type="button"
        onClick={() => onLayersChange({ objects: [{ type: 'i-text', text: 'Hello' }] })}
      >
        Add layer
      </button>
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

const workshopContext: WorkshopContext = {
  product: { id: 'prod-1', name: 'Classic Tee', slug: 'classic-tee', options: [] },
  views: [
    {
      id: 'view-1',
      key: 'front',
      displayName: 'Front',
      sortOrder: 0,
      isDesignable: true,
      isDefault: true,
      printArea: null,
      templateLayers: [],
      effects: [],
    },
  ],
};

const existingDesign = {
  id: 'design-1',
  productId: 'prod-1',
  name: 'Saved name',
  designData: {
    version: 1,
    productId: 'prod-1',
    views: {
      front: {
        productViewId: 'view-1',
        fabricJson: { objects: [] },
        isUsed: false,
        layerCount: 0,
      },
    },
  },
  moderationStatus: 'PENDING',
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
  product: { id: 'prod-1', name: 'Classic Tee', slug: 'classic-tee' },
} as Design;

function renderEditor(design?: Design) {
  return render(
    <TooltipProvider>
      <WorkshopEditor workshopContext={workshopContext} existingDesign={design} />
    </TooltipProvider>
  );
}

describe('WorkshopEditor auto-save', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(updateDesign).mockReset().mockResolvedValue(existingDesign);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('saves the latest layers and name after the inactivity delay', async () => {
    renderEditor(existingDesign);

    fireEvent.change(screen.getByDisplayValue('Saved name'), {
      target: { value: 'Renamed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add layer' }));

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(updateDesign).toHaveBeenCalledTimes(1);
    const [id, payload] = jest.mocked(updateDesign).mock.calls[0];
    expect(id).toBe('design-1');
    expect(payload.name).toBe('Renamed');
    expect(payload.designData?.views.front.fabricJson.objects).toEqual([
      { type: 'i-text', text: 'Hello' },
    ]);
    expect(payload.designData?.views.front.layerCount).toBe(1);
  });

  it('does not auto-save a design that was never saved', async () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Add layer' }));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(updateDesign).not.toHaveBeenCalled();
  });
});
