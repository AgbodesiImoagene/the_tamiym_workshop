/** TTW-263: upload, replace and remove the profile picture on Profile and Settings. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePictureField } from '@/components/profile-picture-field';
import { authApi } from '@/lib/auth';
import { removeAvatar, uploadAvatar } from '@/lib/avatar';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/auth', () => ({ authApi: { getMe: jest.fn() } }));
jest.mock('@/lib/avatar', () => ({
  ...jest.requireActual('@/lib/avatar'),
  uploadAvatar: jest.fn(),
  removeAvatar: jest.fn(),
}));

const getMe = authApi.getMe as jest.Mock;
const baseUser = { id: 'u1', email: 'ada@example.com', firstName: 'Ada', role: 'CUSTOMER' };

function renderField(label = 'Upload Profile Picture') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProfilePictureField buttonLabel={label} />
    </QueryClientProvider>
  );
  return client;
}

function pick(input: HTMLElement, f: File) {
  fireEvent.change(input, { target: { files: [f] } });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ProfilePictureField', () => {
  it('shows the initials and the upload button when there is no picture', async () => {
    getMe.mockResolvedValue(baseUser);
    renderField();
    expect(await screen.findByText('AD')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload Profile Picture' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Remove picture' })).toBeNull();
  });

  it('uses the label it is given and offers to remove an existing picture', async () => {
    getMe.mockResolvedValue({ ...baseUser, avatarVersion: 'v1' });
    renderField('Update Profile Picture');
    expect(await screen.findByRole('img', { name: /Ada/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Profile Picture' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove picture' })).toBeInTheDocument();
  });

  it('uploads the chosen image and shows the new picture without reloading', async () => {
    getMe.mockResolvedValue(baseUser);
    (uploadAvatar as jest.Mock).mockResolvedValue({ avatarVersion: 'v9' });
    const client = renderField();
    await screen.findByText('AD');

    const f = new File([new Uint8Array(10)], 'me.jpg', { type: 'image/jpeg' });
    pick(screen.getByLabelText('Profile picture file'), f);

    await waitFor(() => expect(uploadAvatar).toHaveBeenCalledWith(f));
    expect(await screen.findByRole('img', { name: /Ada/ })).toHaveAttribute(
      'src',
      expect.stringContaining('v=v9')
    );
    expect(client.getQueryData<{ avatarVersion?: string }>(['auth', 'me'])?.avatarVersion).toBe(
      'v9'
    );
  });

  it('refuses a file that is not an image, tells why and sends nothing', async () => {
    getMe.mockResolvedValue(baseUser);
    renderField();
    await screen.findByText('AD');

    pick(
      screen.getByLabelText('Profile picture file'),
      new File(['x'], 'notes.pdf', { type: 'application/pdf' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG or WebP/);
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('shows the API message when the upload fails and keeps the old picture', async () => {
    getMe.mockResolvedValue({ ...baseUser, avatarVersion: 'v1' });
    (uploadAvatar as jest.Mock).mockRejectedValue({
      message: 'The file was rejected',
      statusCode: 400,
    });
    renderField();
    await screen.findByRole('img', { name: /Ada/ });

    pick(
      screen.getByLabelText('Profile picture file'),
      new File([new Uint8Array(10)], 'me.png', { type: 'image/png' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('The file was rejected');
    expect(screen.getByRole('img', { name: /Ada/ })).toHaveAttribute(
      'src',
      expect.stringContaining('v=v1')
    );
  });

  it('disables the buttons while an upload is running', async () => {
    getMe.mockResolvedValue(baseUser);
    let finish: (v: { avatarVersion: string }) => void = () => undefined;
    (uploadAvatar as jest.Mock).mockReturnValue(new Promise((r) => (finish = r)));
    renderField();
    await screen.findByText('AD');

    pick(
      screen.getByLabelText('Profile picture file'),
      new File([new Uint8Array(10)], 'me.png', { type: 'image/png' })
    );

    expect(await screen.findByRole('button', { name: 'Uploading...' })).toBeDisabled();
    finish({ avatarVersion: 'v2' });
    expect(await screen.findByRole('button', { name: 'Upload Profile Picture' })).toBeEnabled();
  });

  it('removes the picture and goes back to the initials', async () => {
    getMe.mockResolvedValue({ ...baseUser, avatarVersion: 'v1' });
    (removeAvatar as jest.Mock).mockResolvedValue(undefined);
    renderField();
    await screen.findByRole('img', { name: /Ada/ });

    fireEvent.click(screen.getByRole('button', { name: 'Remove picture' }));

    await waitFor(() => expect(removeAvatar).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('img', { name: /Ada/ })).toBeNull());
    expect(screen.getByText('AD')).toBeInTheDocument();
  });
});
