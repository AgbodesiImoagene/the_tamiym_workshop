/**
 * TTW-105: the workshop pages sit inside the customer dashboard (sidebar), like the Figma screens.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@tamiym/ui';
import WorkshopPageShell from '@/components/workshop/WorkshopPageShell';
import { authApi } from '@/lib/auth';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
}));

jest.mock('@/lib/auth', () => ({
  authApi: { getMe: jest.fn(), logout: jest.fn() },
}));

jest.mock('@/components/email-verification-banner', () => ({
  EmailVerificationBanner: () => null,
}));

function renderShell() {
  return render(
    <TooltipProvider>
      <WorkshopPageShell>
        <p>Editor goes here</p>
      </WorkshopPageShell>
    </TooltipProvider>
  );
}

describe('WorkshopPageShell', () => {
  beforeEach(() => {
    push.mockReset();
    jest.mocked(authApi.getMe).mockReset();
  });

  it('shows the dashboard sidebar around the editor, with Design as the current page', async () => {
    jest
      .mocked(authApi.getMe)
      .mockResolvedValue({ firstName: 'Ada', email: 'ada@example.com' } as never);
    renderShell();

    expect(screen.getByText('Editor goes here')).toBeInTheDocument();
    for (const name of ['Home', 'Products', 'Design', 'Orders', 'Fundraiser']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
  });

  it('sends a signed-out visitor to the login page', async () => {
    jest.mocked(authApi.getMe).mockRejectedValue({ statusCode: 401, message: 'Unauthorized' });
    renderShell();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/login'));
  });
});
