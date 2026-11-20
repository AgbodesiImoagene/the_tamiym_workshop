/**
 * TTW-233: the edit route loads the design in the browser (where the customer cookie is),
 * and shows explicit loading, not found, unauthorized and error-with-retry states.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EditDesignLoader from '@/components/workshop/EditDesignLoader';
import { getDesign, getProductWorkshop, type Design, type WorkshopContext } from '@/lib/designs';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace }),
}));

jest.mock('@/components/workshop/WorkshopEditor', () => ({
  __esModule: true,
  default: ({
    workshopContext,
    existingDesign,
  }: {
    workshopContext: WorkshopContext;
    existingDesign?: Design;
  }) => (
    <p>
      Editor for {existingDesign?.name} on {workshopContext.product.name}
    </p>
  ),
}));

jest.mock('@/lib/designs', () => ({
  getDesign: jest.fn(),
  getProductWorkshop: jest.fn(),
}));

const mockedGetDesign = jest.mocked(getDesign);
const mockedGetProductWorkshop = jest.mocked(getProductWorkshop);

const design = {
  id: 'design-1',
  productId: 'prod-1',
  name: 'Saved name',
} as Design;

const workshopContext = {
  product: { id: 'prod-1', name: 'Classic Tee', slug: 'classic-tee', options: [] },
  views: [],
} as WorkshopContext;

function renderLoader() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <EditDesignLoader designId="design-1" />
    </QueryClientProvider>
  );
}

describe('EditDesignLoader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('shows a loading state, then the editor with the saved design', async () => {
    mockedGetDesign.mockResolvedValue(design);
    mockedGetProductWorkshop.mockResolvedValue(workshopContext);

    renderLoader();

    expect(screen.getByRole('status')).toHaveTextContent(/loading your design/i);
    expect(await screen.findByText('Editor for Saved name on Classic Tee')).toBeInTheDocument();
    expect(mockedGetDesign).toHaveBeenCalledWith('design-1');
    expect(mockedGetProductWorkshop).toHaveBeenCalledWith('prod-1');
  });

  it('shows "not found" with a way back when the design does not exist', async () => {
    mockedGetDesign.mockRejectedValue({ statusCode: 404, message: 'Not Found' });

    renderLoader();

    expect(await screen.findByRole('heading', { name: /design not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to design workshop/i })).toHaveAttribute(
      'href',
      '/dashboard/design'
    );
    expect(mockedGetProductWorkshop).not.toHaveBeenCalled();
  });

  it('shows the same "not found" screen for another customer\'s design (403)', async () => {
    mockedGetDesign.mockRejectedValue({ statusCode: 403, message: 'Access denied' });

    renderLoader();

    expect(await screen.findByRole('heading', { name: /design not found/i })).toBeInTheDocument();
    expect(mockedGetProductWorkshop).not.toHaveBeenCalled();
  });

  it('sends a signed-out customer to the login page', async () => {
    mockedGetDesign.mockRejectedValue({ statusCode: 401, message: 'Unauthorized' });

    renderLoader();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/login'));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/editor for/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error with a retry, and loads the design when the retry works', async () => {
    mockedGetDesign.mockRejectedValueOnce({ statusCode: 500, message: 'Server error' });
    mockedGetDesign.mockResolvedValue(design);
    mockedGetProductWorkshop.mockResolvedValue(workshopContext);

    renderLoader();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load this design/i);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Editor for Saved name on Classic Tee')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the same error when only the product workshop fails to load', async () => {
    mockedGetDesign.mockResolvedValue(design);
    mockedGetProductWorkshop.mockRejectedValue({ statusCode: 500, message: 'Server error' });

    renderLoader();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load this design/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('loads the design when the retry of a failed product workshop works', async () => {
    mockedGetDesign.mockResolvedValue(design);
    mockedGetProductWorkshop.mockRejectedValueOnce({ statusCode: 500, message: 'Server error' });
    mockedGetProductWorkshop.mockResolvedValue(workshopContext);

    renderLoader();

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Editor for Saved name on Classic Tee')).toBeInTheDocument();
  });
});
