/** TTW-263: one avatar for the sidebar, Profile and Settings. */
import { fireEvent, render, screen } from '@testing-library/react';
import { UserAvatar } from '@/components/user-avatar';

describe('UserAvatar', () => {
  it('shows the initials when the user has no picture', () => {
    render(<UserAvatar initials="AD" />);
    expect(screen.getByText('AD')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows the picture, from the authenticated route, with the initials as a backdrop', () => {
    render(<UserAvatar initials="AD" avatarVersion="v1" alt="Ada" />);
    const img = screen.getByRole('img', { name: 'Ada' });
    expect(img).toHaveAttribute('src', expect.stringMatching(/\/users\/profile\/avatar\?v=v1$/));
    expect(screen.getByText('AD')).toBeInTheDocument();
  });

  it('goes back to the initials when the picture cannot be loaded', () => {
    render(<UserAvatar initials="AD" avatarVersion="v1" alt="Ada" />);
    fireEvent.error(screen.getByRole('img', { name: 'Ada' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('AD')).toBeInTheDocument();
  });

  it('tries the picture again when the version changes', () => {
    const { rerender } = render(<UserAvatar initials="AD" avatarVersion="v1" alt="Ada" />);
    fireEvent.error(screen.getByRole('img', { name: 'Ada' }));
    rerender(<UserAvatar initials="AD" avatarVersion="v2" alt="Ada" />);
    expect(screen.getByRole('img', { name: 'Ada' })).toHaveAttribute(
      'src',
      expect.stringContaining('v=v2')
    );
  });
});
