/**
 * TTW-104: the layer list tells the customer when an image may print blurry, without blocking
 * anything.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import LayerList, { type LayerItem } from '@/components/workshop/LayerList';

const layers = (items: Partial<LayerItem>[]): LayerItem[] =>
  items.map((item, i) => ({ id: `l${i}`, label: 'Image', kind: 'image', ...item }));

const renderList = (items: LayerItem[], onSelect = jest.fn()) =>
  render(
    <LayerList
      layers={items}
      selectedId={null}
      onSelect={onSelect}
      onDelete={jest.fn()}
      onMove={jest.fn()}
    />
  );

describe('LayerList low-resolution note', () => {
  it('says "May print blurry" under a low-resolution image only', () => {
    renderList(
      layers([
        { id: 'small', label: 'Image', lowResolution: true },
        { id: 'big', label: 'Image', lowResolution: false },
        { id: 'text', label: 'Hello', kind: 'text' },
      ])
    );
    expect(screen.getAllByText('May print blurry')).toHaveLength(1);
  });

  it('shows no note when nothing is low resolution', () => {
    renderList(layers([{ lowResolution: false }, {}]));
    expect(screen.queryByText('May print blurry')).not.toBeInTheDocument();
  });

  it('keeps every control working for a low-resolution image', () => {
    const onSelect = jest.fn();
    renderList(layers([{ id: 'small', lowResolution: true }]), onSelect);
    const select = screen.getByRole('button', { name: /^Select Image/ });
    expect(select).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete Image' })).toBeEnabled();
    fireEvent.click(select);
    expect(onSelect).toHaveBeenCalledWith('small');
  });

  it('describes the select button with the note, so a screen reader hears it', () => {
    renderList(layers([{ lowResolution: true }]));
    expect(screen.getByRole('button', { name: 'Select Image' })).toHaveAccessibleDescription(
      'May print blurry'
    );
  });
});
