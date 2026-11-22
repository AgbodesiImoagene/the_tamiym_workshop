/**
 * TTW-105: the editor follows the approved Figma layout: a left tool rail (Upload, Add Text,
 * Product Colors, then one thumbnail per view), the open tool next to it, and the canvas.
 * Layout only: every tool keeps its behaviour.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TooltipProvider } from '@tamiym/ui';
import WorkshopEditor from '@/components/workshop/WorkshopEditor';
import type { WorkshopContext } from '@/lib/designs';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('next/dynamic', () => () => {
  function FakeCanvas() {
    return <div data-testid="canvas" />;
  }
  return FakeCanvas;
});

jest.mock('@/components/workshop/SharePanel', () => () => null);

jest.mock('@/lib/designs', () => ({
  createDesign: jest.fn(),
  updateDesign: jest.fn(),
  uploadThumbnail: jest.fn(),
}));

function view(id: string, key: string, displayName: string, sortOrder: number, isDefault = false) {
  return {
    id,
    key,
    displayName,
    sortOrder,
    isDesignable: true,
    isDefault,
    printArea: null,
    templateLayers: [],
    effects: [],
  };
}

const workshopContext: WorkshopContext = {
  product: {
    id: 'prod-1',
    name: 'Classic Tee',
    slug: 'classic-tee',
    options: [
      {
        id: 'opt-size',
        name: 'Size',
        sortOrder: 0,
        values: [
          { id: 'v-m', displayName: 'M', valueCode: 'M', metadata: null, sortOrder: 0 },
          { id: 'v-l', displayName: 'L', valueCode: 'L', metadata: null, sortOrder: 1 },
        ],
      },
    ],
  },
  views: [view('view-1', 'front', 'Front', 0, true), view('view-2', 'back', 'Back', 1)],
};

function renderEditor(context: WorkshopContext = workshopContext) {
  return render(
    <TooltipProvider>
      <WorkshopEditor workshopContext={context} />
    </TooltipProvider>
  );
}

describe('WorkshopEditor layout (Figma)', () => {
  it('has a left tool rail with Upload, Add Text and Product Colors', () => {
    renderEditor();
    const rail = screen.getByRole('group', { name: 'Workshop tools' });
    for (const name of ['Upload', 'Add Text', 'Product Colors']) {
      expect(within(rail).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('puts a thumbnail for each view in the rail', () => {
    renderEditor();
    const rail = screen.getByRole('group', { name: 'Workshop tools' });
    expect(within(rail).getByRole('tab', { name: /Front/ })).toBeInTheDocument();
    expect(within(rail).getByRole('tab', { name: /Back/ })).toBeInTheDocument();
  });

  it('opens Add Text first and switches tool from the rail', () => {
    renderEditor();
    expect(screen.getByPlaceholderText('Enter text…')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Choose image' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeVisible();
    expect(screen.getByPlaceholderText('Enter text…')).not.toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Product Colors' }));
    expect(screen.getByRole('button', { name: 'M' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Choose image' })).not.toBeInTheDocument();
  });

  it('keeps what was typed in Add Text when another tool is opened and closed', () => {
    renderEditor();
    fireEvent.change(screen.getByPlaceholderText('Enter text…'), { target: { value: 'Keep me' } });

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    fireEvent.click(screen.getByRole('button', { name: 'Product Colors' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Text' }));

    expect(screen.getByPlaceholderText('Enter text…')).toHaveValue('Keep me');
  });

  it('keeps the image tool mounted (hidden) when another tool is open', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add Text' }));
    expect(screen.getByRole('button', { name: 'Choose image', hidden: true })).toBeInTheDocument();
  });

  it('marks the open tool and does not claim a vertical layout', () => {
    renderEditor();
    const rail = screen.getByRole('group', { name: 'Workshop tools' });
    expect(within(rail).getByRole('button', { name: 'Add Text' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(rail).getByRole('button', { name: 'Upload' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(rail).not.toHaveAttribute('aria-orientation');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('says what the upload really accepts, not what Figma lists', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.getByText('PNG, JPEG or WebP · max 10 MB')).toBeVisible();
    expect(screen.queryByText(/EPS|\bAI\b|PDF|5 MB/)).not.toBeInTheDocument();
  });

  it('keeps layers, undo, redo, delete and the design name whatever tool is open', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.getByRole('heading', { name: 'Layers' })).toBeInTheDocument();
    expect(screen.getByText(/no layers yet/i)).toBeInTheDocument();
    for (const name of ['Undo', 'Redo', 'Delete']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Design name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('shows no control that is out of scope or has no action', () => {
    renderEditor();
    for (const name of ['Add Product', 'Remove Product', 'Duplicate Product', 'Get Price']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('hides Product Colors when the product has no option to pick', () => {
    renderEditor({ ...workshopContext, product: { ...workshopContext.product, options: [] } });
    expect(screen.queryByRole('button', { name: 'Product Colors' })).not.toBeInTheDocument();
  });

  describe('keyboard order follows the visual order', () => {
    const realMatchMedia = window.matchMedia;
    function setScreen(isMd: boolean) {
      window.matchMedia = ((query: string) => ({
        matches: query.includes('min-width') ? isMd : false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        onchange: null,
        dispatchEvent: jest.fn(),
      })) as unknown as typeof window.matchMedia;
    }
    afterEach(() => {
      window.matchMedia = realMatchMedia;
    });

    const isBefore = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('on a phone, the canvas comes before the tool panel in the page, not only on screen', () => {
      setScreen(false);
      renderEditor();
      expect(
        isBefore(screen.getByTestId('canvas'), screen.getByPlaceholderText('Enter text…'))
      ).toBe(true);
    });

    it('from a tablet up, the tool panel comes before the canvas', () => {
      setScreen(true);
      renderEditor();
      expect(
        isBefore(screen.getByPlaceholderText('Enter text…'), screen.getByTestId('canvas'))
      ).toBe(true);
    });
  });
});
