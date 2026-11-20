/**
 * TTW-102: the editor wires the toolbar, the layer list and the keyboard to the canvas
 * controls. Before this ticket the editor never received the canvas, so "Add to canvas"
 * did nothing at all.
 */
import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@tamiym/ui';
import WorkshopEditor from '@/components/workshop/WorkshopEditor';
import type { WorkshopContext } from '@/lib/designs';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const mockSeenEffects: unknown[] = [];

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

// Stand-in for the real canvas: it publishes the controls and lets the test report
// layers, a selection and the history state through buttons.
jest.mock('next/dynamic', () => () => {
  function FakeCanvas(props: {
    activeEffects: unknown;
    controlRef: { current: unknown };
    onLayersChange: (json: unknown) => void;
    onSelectionChange: (id: string | null) => void;
    onHistoryChange: (state: { canUndo: boolean; canRedo: boolean }) => void;
  }) {
    const { controlRef } = props;
    mockSeenEffects.push(props.activeEffects);
    useEffect(() => {
      controlRef.current = mockControls;
      return () => {
        controlRef.current = null;
      };
    }, [controlRef]);
    return (
      <>
        <button
          type="button"
          onClick={() =>
            props.onLayersChange({
              objects: [
                { type: 'IText', text: 'Hello', data: { layerId: 'l1' } },
                { type: 'FabricImage', data: { layerId: 'l2', designAssetId: 'a1' } },
              ],
            })
          }
        >
          Report layers
        </button>
        <button type="button" onClick={() => props.onSelectionChange('l1')}>
          Report selection
        </button>
        <button
          type="button"
          onClick={() => props.onHistoryChange({ canUndo: true, canRedo: true })}
        >
          Report history
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

function renderEditor() {
  return render(
    <TooltipProvider>
      <WorkshopEditor workshopContext={workshopContext} />
    </TooltipProvider>
  );
}

describe('WorkshopEditor layer controls', () => {
  beforeEach(() => {
    Object.values(mockControls).forEach((fn) => fn.mockReset());
    mockControls.deleteSelected.mockReturnValue(true);
  });

  it('hands the canvas the same effects array on every render, so templates are not reloaded', () => {
    mockSeenEffects.length = 0;
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Report selection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Report history' }));

    expect(mockSeenEffects.length).toBeGreaterThan(2);
    expect(mockSeenEffects.every((effects) => effects === mockSeenEffects[0])).toBe(true);
  });

  it('sends the text from "Add to canvas" to the canvas', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));

    expect(mockControls.addText).toHaveBeenCalledTimes(1);
    expect(mockControls.addText).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'i-text', text: 'Your text here' })
    );
  });

  it('starts with Undo, Redo and Delete disabled', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('enables the buttons from the canvas state and calls the matching control', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Report history' }));
    fireEvent.click(screen.getByRole('button', { name: 'Report selection' }));

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mockControls.undo).toHaveBeenCalledTimes(1);
    expect(mockControls.redo).toHaveBeenCalledTimes(1);
    expect(mockControls.deleteSelected).toHaveBeenCalledTimes(1);
  });

  it('lists the layers reported by the canvas and drives them from the list', () => {
    renderEditor();
    expect(screen.getByText(/no layers yet/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Report layers' }));
    expect(screen.queryByText(/no layers yet/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select Hello' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Hello up' }));

    expect(mockControls.selectLayer).toHaveBeenCalledWith('l1');
    expect(mockControls.deleteLayer).toHaveBeenCalledWith('l2');
    expect(mockControls.moveLayer).toHaveBeenCalledWith('l1', 'up');
  });

  it('deletes the selected layer with the Delete and Backspace keys', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Report selection' }));

    fireEvent.keyDown(document.body, { key: 'Delete' });
    fireEvent.keyDown(document.body, { key: 'Backspace' });

    expect(mockControls.deleteSelected).toHaveBeenCalledTimes(2);
  });

  it('ignores Delete and Backspace while typing in a field', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Report selection' }));

    fireEvent.keyDown(screen.getByPlaceholderText('Enter text…'), { key: 'Backspace' });
    fireEvent.keyDown(screen.getByLabelText('Design name'), { key: 'Delete' });

    expect(mockControls.deleteSelected).not.toHaveBeenCalled();
  });

  it('undoes and redoes with Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z outside text fields', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Report history' }));

    act(() => {
      fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
      fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true });
      fireEvent.keyDown(screen.getByPlaceholderText('Enter text…'), { key: 'z', ctrlKey: true });
    });

    expect(mockControls.undo).toHaveBeenCalledTimes(1);
    expect(mockControls.redo).toHaveBeenCalledTimes(1);
  });
});
