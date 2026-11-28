/** TTW-266: choosing a colour by typing its name (`@tamiym/ui` ColorPicker). */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColorPicker } from '@tamiym/ui';

function renderPicker(value: string | null = null) {
  const onChange = jest.fn();
  render(<ColorPicker label="Color" value={value} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

const trigger = () => screen.getByRole('button', { name: /^Color:/ });
const search = () => screen.getByRole('combobox', { name: 'Search colors' });

describe('ColorPicker', () => {
  it('asks to choose a colour when there is none', () => {
    renderPicker();
    expect(trigger()).toHaveAccessibleName('Color: Choose a color');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows the name and hex of the current colour', () => {
    renderPicker('#FFFFFF');
    expect(trigger()).toHaveAccessibleName('Color: White #FFFFFF');
    expect(trigger()).toHaveTextContent('White');
  });

  it('shows a hex that is not in the list as it is', () => {
    const { onChange } = renderPicker('#1f3c88');
    expect(trigger()).toHaveAccessibleName('Color: Custom #1f3c88');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('filters the list by the typed name and returns the clicked colour', async () => {
    const { onChange, user } = renderPicker();

    await user.click(trigger());
    expect(search()).toHaveFocus();
    await user.type(search(), 'orange');

    const options = screen.getAllByRole('option');
    for (const option of options) expect(option).toHaveTextContent(/orange/i);

    await user.click(screen.getByRole('option', { name: /^Orange #/ }));
    expect(onChange).toHaveBeenCalledWith({ name: 'Orange', hex: '#ffa500' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('chooses the first result with Enter', async () => {
    const { onChange, user } = renderPicker();

    await user.click(trigger());
    await user.type(search(), 'green{Enter}');

    expect(onChange).toHaveBeenCalledWith({ name: 'Green', hex: '#008000' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('moves through the results with the arrow keys', async () => {
    const { onChange, user } = renderPicker();

    await user.click(trigger());
    await user.type(search(), 'green');
    const second = screen.getAllByRole('option')[1];
    await user.keyboard('{ArrowDown}');
    expect(search()).toHaveAttribute('aria-activedescendant', second.id);
    await user.keyboard('{ArrowUp}{ArrowDown}{Enter}');

    expect(second).toBeDefined();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(second.textContent).toContain(onChange.mock.calls[0][0].name);
  });

  it('marks the current colour in the list', async () => {
    const { user } = renderPicker('#008000');

    await user.click(trigger());

    expect(screen.getByRole('option', { name: /^Green #008000/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('keeps the current colour when Enter opens the list and Enter is pressed again', async () => {
    const { onChange, user } = renderPicker('#008000');

    trigger().focus();
    await user.keyboard('{Enter}');
    expect(search()).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /^Green #008000/ }).id
    );
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith({ name: 'Green', hex: '#008000' });
  });

  it('does not replace a custom colour when Enter is pressed again', async () => {
    const { onChange, user } = renderPicker('#1f3c88');

    trigger().focus();
    await user.keyboard('{Enter}');
    expect(search()).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith({ name: 'Black', hex: '#000000' });
  });

  it('shows the results from the top when the search changes', async () => {
    const { user } = renderPicker('#8e4585');

    await user.click(trigger());
    const list = screen.getByRole('listbox');
    list.scrollTop = 400;
    await user.type(search(), 'gr');

    expect(list.scrollTop).toBe(0);
  });

  it('marks the option reached with the arrow keys as selected', async () => {
    const { user } = renderPicker();

    await user.click(trigger());
    await user.keyboard('{ArrowDown}');

    const selected = screen.getAllByRole('option', { selected: true });
    expect(selected).toEqual([screen.getAllByRole('option')[1]]);
  });

  it('names the popup for screen readers', async () => {
    const { user } = renderPicker();

    await user.click(trigger());

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Color');
  });

  it('says when no colour matches and chooses nothing', async () => {
    const { onChange, user } = renderPicker();

    await user.click(trigger());
    await user.type(search(), 'zzzz{Enter}');

    expect(screen.getByText('No color found.')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('starts from an empty search each time it opens', async () => {
    const { user } = renderPicker();

    await user.click(trigger());
    await user.type(search(), 'green');
    await user.keyboard('{Escape}');
    await user.click(trigger());

    expect(search()).toHaveValue('');
  });

  it('cannot be opened when disabled', () => {
    render(<ColorPicker label="Color" value={null} onChange={jest.fn()} disabled />);
    expect(trigger()).toBeDisabled();
  });
});
