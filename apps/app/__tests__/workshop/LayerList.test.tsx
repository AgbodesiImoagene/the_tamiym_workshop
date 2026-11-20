/**
 * TTW-102: layer list. `layers` is given bottom to top (Fabric stacking order);
 * the list shows the top layer first.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TooltipProvider } from '@tamiym/ui';
import LayerList, { type LayerItem } from '@/components/workshop/LayerList';

const layers: LayerItem[] = [
  { id: 'l1', label: 'Back text', kind: 'text' },
  { id: 'l2', label: 'Logo', kind: 'image' },
  { id: 'l3', label: 'Front text', kind: 'text' },
];

function renderList(overrides: Partial<React.ComponentProps<typeof LayerList>> = {}) {
  const props = {
    layers,
    selectedId: null,
    onSelect: jest.fn(),
    onDelete: jest.fn(),
    onMove: jest.fn(),
    ...overrides,
  };
  render(
    <TooltipProvider>
      <LayerList {...props} />
    </TooltipProvider>
  );
  return props;
}

describe('LayerList', () => {
  it('shows an empty state when there is no layer', () => {
    renderList({ layers: [] });
    expect(screen.getByText(/no layers yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('lists the top layer first', () => {
    renderList();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Front text'),
      expect.stringContaining('Logo'),
      expect.stringContaining('Back text'),
    ]);
  });

  it('selects a layer when its name is clicked and marks the selected one', () => {
    const props = renderList({ selectedId: 'l2' });
    fireEvent.click(screen.getByRole('button', { name: 'Select Back text' }));
    expect(props.onSelect).toHaveBeenCalledWith('l1');
    expect(screen.getByRole('button', { name: 'Select Logo' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('deletes a layer', () => {
    const props = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Logo' }));
    expect(props.onDelete).toHaveBeenCalledWith('l2');
  });

  it('moves a layer up and down', () => {
    const props = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Move Logo up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Logo down' }));
    expect(props.onMove).toHaveBeenNthCalledWith(1, 'l2', 'up');
    expect(props.onMove).toHaveBeenNthCalledWith(2, 'l2', 'down');
  });

  it('disables every action while the canvas is not ready', () => {
    const props = renderList({ disabled: true });
    for (const name of ['Select Logo', 'Delete Logo', 'Move Logo up', 'Move Logo down']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Delete Logo' }));
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it('disables "up" on the top layer and "down" on the bottom layer', () => {
    renderList();
    expect(screen.getByRole('button', { name: 'Move Front text up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Back text down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Logo up' })).toBeEnabled();
  });
});
