/**
 * TTW-236: the public shared-design page must ask for the workshop of the design's
 * product (`product.id`, the only product id the public response carries) and render
 * one canvas per designable view with the share token.
 */
import { render, screen } from '@testing-library/react';
import SharedDesignPage from '@/app/design/shared/[shareToken]/page';
import { getProductWorkshop, getSharedDesign } from '@/lib/designs';

jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

jest.mock('@/lib/designs', () => ({
  getSharedDesign: jest.fn(),
  getProductWorkshop: jest.fn(),
}));

jest.mock('@/components/workshop/SharedWorkshopCanvas', () => ({
  SharedWorkshopCanvas: ({ viewKey, shareToken }: { viewKey: string; shareToken: string }) => (
    <div data-testid="shared-canvas">{`${viewKey}:${shareToken}`}</div>
  ),
}));

const sharedMock = jest.mocked(getSharedDesign);
const workshopMock = jest.mocked(getProductWorkshop);

// The exact shape of the public response (DesignsService.findByShareToken): no productId.
const publicDesign = {
  id: 'design-1',
  name: 'My tee',
  designData: { views: { front: { productViewId: 'v1', fabricJson: { objects: [] } } } },
  thumbnailUrl: 'https://cdn.example/thumb.png',
  createdAt: '2026-11-20T10:00:00.000Z',
  product: { id: 'prod-1', name: 'Classic Tee', slug: 'classic-tee' },
  views: [],
};

async function renderPage() {
  const ui = await SharedDesignPage({ params: Promise.resolve({ shareToken: 'tok_abc' }) });
  return render(ui);
}

describe('SharedDesignPage (TTW-236)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sharedMock.mockResolvedValue(publicDesign as never);
  });

  it('loads the workshop of product.id and renders one canvas per designable view', async () => {
    workshopMock.mockResolvedValue({
      views: [
        {
          key: 'front',
          displayName: 'Front',
          isDesignable: true,
          printArea: {},
          templateLayers: [],
        },
        { key: 'back', displayName: 'Back', isDesignable: true, printArea: {}, templateLayers: [] },
        {
          key: 'sleeve',
          displayName: 'Sleeve',
          isDesignable: false,
          printArea: {},
          templateLayers: [],
        },
      ],
    } as never);

    await renderPage();

    expect(workshopMock).toHaveBeenCalledTimes(1);
    expect(workshopMock).toHaveBeenCalledWith('prod-1');
    const canvases = screen.getAllByTestId('shared-canvas');
    expect(canvases.map((c) => c.textContent)).toEqual(['front:tok_abc', 'back:tok_abc']);
  });

  it('falls back to the thumbnail when the workshop cannot be loaded', async () => {
    workshopMock.mockRejectedValue(new Error('boom'));

    await renderPage();

    expect(screen.queryByTestId('shared-canvas')).toBeNull();
    expect(screen.getByRole('img', { name: 'My tee' })).toBeInTheDocument();
  });
});
