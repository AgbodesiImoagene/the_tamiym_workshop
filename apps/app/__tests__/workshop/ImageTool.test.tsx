import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImageTool from '@/components/workshop/ImageTool';
import { uploadDesignAsset } from '@/lib/designs';

jest.mock('@/lib/designs', () => ({
  ...jest.requireActual('@/lib/designs'),
  uploadDesignAsset: jest.fn(),
}));

const mockUpload = uploadDesignAsset as jest.MockedFunction<typeof uploadDesignAsset>;

function pickFile(file: File) {
  const input = document.getElementById('image-tool-input') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('ImageTool (TTW-099)', () => {
  beforeEach(() => {
    mockUpload.mockReset();
  });

  it('adds the uploaded image through the private file path, never a storage URL', async () => {
    mockUpload.mockResolvedValue({ designAssetId: 'da_42', status: 'pending' });
    const onAddImage = jest.fn();
    render(<ImageTool onAddImage={onAddImage} />);

    pickFile(new File(['x'], 'logo.png', { type: 'image/png' }));

    await waitFor(() => expect(onAddImage).toHaveBeenCalledTimes(1));
    const added = onAddImage.mock.calls[0][0] as Record<string, unknown>;
    expect(added.src).toBe('http://localhost:3001/v1/design-assets/da_42/file?variant=original');
    expect(added.data).toEqual({ designAssetId: 'da_42' });
  });

  it('shows the error and adds nothing when the upload fails', async () => {
    mockUpload.mockRejectedValue({ message: 'Unsupported file type', statusCode: 400 });
    const onAddImage = jest.fn();
    render(<ImageTool onAddImage={onAddImage} />);

    pickFile(new File(['x'], 'logo.png', { type: 'image/png' }));

    expect(await screen.findByText('Unsupported file type')).toBeInTheDocument();
    expect(onAddImage).not.toHaveBeenCalled();
  });
});
