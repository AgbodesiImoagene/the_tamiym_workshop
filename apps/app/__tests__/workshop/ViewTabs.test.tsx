import { render, screen, fireEvent } from '@testing-library/react';
import ViewTabs from '@/components/workshop/ViewTabs';
import type { WorkshopView, DesignData } from '@/lib/designs';

const mockViews: WorkshopView[] = [
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
  {
    id: 'view-2',
    key: 'back',
    displayName: 'Back',
    sortOrder: 1,
    isDesignable: true,
    isDefault: false,
    printArea: null,
    templateLayers: [],
    effects: [],
  },
];

const emptyDesignData: DesignData = {
  version: 1,
  productId: 'prod-1',
  views: {
    front: {
      productViewId: 'view-1',
      fabricJson: { objects: [] },
      isUsed: false,
      layerCount: 0,
    },
    back: {
      productViewId: 'view-2',
      fabricJson: { objects: [{}] },
      isUsed: true,
      layerCount: 1,
    },
  },
};

describe('ViewTabs', () => {
  it('renders a tab for each designable view', () => {
    render(
      <ViewTabs
        views={mockViews}
        activeViewKey="front"
        designData={emptyDesignData}
        onViewChange={jest.fn()}
      />
    );

    expect(screen.getByText('Front')).toBeInTheDocument();
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('calls onViewChange with the correct view key when a tab is clicked', () => {
    const onViewChange = jest.fn();
    render(
      <ViewTabs
        views={mockViews}
        activeViewKey="front"
        designData={emptyDesignData}
        onViewChange={onViewChange}
      />
    );

    fireEvent.click(screen.getByText('Back'));
    expect(onViewChange).toHaveBeenCalledWith('back');
  });

  it('shows a dot badge on views with layers', () => {
    render(
      <ViewTabs
        views={mockViews}
        activeViewKey="front"
        designData={emptyDesignData}
        onViewChange={jest.fn()}
      />
    );

    // The back view has 1 layer, so it should show the badge
    const badge = screen.getByLabelText('has layers');
    expect(badge).toBeInTheDocument();
  });

  it('returns null when there is only one designable view', () => {
    const { container } = render(
      <ViewTabs
        views={[mockViews[0]]}
        activeViewKey="front"
        designData={emptyDesignData}
        onViewChange={jest.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
