import { render, screen, fireEvent } from '@testing-library/react';
import SavePanel from '@/components/workshop/SavePanel';

describe('SavePanel', () => {
  it('renders the design name input and save button', () => {
    render(
      <SavePanel
        designName="My Design"
        isSaving={false}
        onNameChange={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    expect(screen.getByDisplayValue('My Design')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('shows "Saving…" text and disables the button while saving', () => {
    render(
      <SavePanel
        designName="My Design"
        isSaving
        onNameChange={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });

  it('calls onSave when the save button is clicked', () => {
    const onSave = jest.fn();
    render(
      <SavePanel
        designName="My Design"
        isSaving={false}
        onNameChange={jest.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('calls onNameChange when the name input changes', () => {
    const onNameChange = jest.fn();
    render(
      <SavePanel
        designName="My Design"
        isSaving={false}
        onNameChange={onNameChange}
        onSave={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('My Design'), {
      target: { value: 'New Name' },
    });
    expect(onNameChange).toHaveBeenCalledWith('New Name');
  });

  it('disables save button when design name is empty', () => {
    render(
      <SavePanel
        designName=""
        isSaving={false}
        onNameChange={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });
});
