/**
 * TTW-102: the "Add" tools have nothing to add to until the canvas is ready. A click in that
 * moment used to do nothing and say nothing (it showed up on the slower CI machine), so the
 * tools stay disabled until then.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@tamiym/ui';
import TextTool from '@/components/workshop/TextTool';
import ImageTool from '@/components/workshop/ImageTool';

describe('TextTool', () => {
  it('adds the text when enabled', () => {
    const onAddText = jest.fn();
    render(
      <TooltipProvider>
        <TextTool onAddText={onAddText} />
      </TooltipProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));
    expect(onAddText).toHaveBeenCalledTimes(1);
  });

  it('cannot add while disabled', () => {
    const onAddText = jest.fn();
    render(
      <TooltipProvider>
        <TextTool onAddText={onAddText} disabled />
      </TooltipProvider>
    );
    const add = screen.getByRole('button', { name: 'Add to canvas' });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(onAddText).not.toHaveBeenCalled();
  });
});

describe('ImageTool', () => {
  it('offers the file choice when enabled', () => {
    render(<ImageTool onAddImage={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeEnabled();
  });

  it('cannot pick a file while disabled', () => {
    const { container } = render(<ImageTool onAddImage={jest.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeDisabled();
    expect(container.querySelector('input[type="file"]')).toBeDisabled();
  });
});
