/**
 * The sidebar must never show a made-up user name while the account is loading.
 */
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@tamiym/ui';
import { CustomerDashboardShell } from '@/components/customer-dashboard-shell';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/components/email-verification-banner', () => ({
  EmailVerificationBanner: () => null,
}));
jest.mock('@/lib/auth', () => ({ authApi: { logout: jest.fn() } }));

function renderShell(displayName: string | undefined) {
  return render(
    <TooltipProvider>
      <CustomerDashboardShell activeNav="home" displayName={displayName}>
        <p>content</p>
      </CustomerDashboardShell>
    </TooltipProvider>
  );
}

describe('CustomerDashboardShell user name', () => {
  it('shows the real name once it is known', () => {
    renderShell('Ada');
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('shows no name, and a loading placeholder, while the user is not loaded', () => {
    renderShell(undefined);
    expect(screen.queryByText('Borngreat')).not.toBeInTheDocument();
    expect(screen.getByTestId('sidebar-user-loading')).toBeInTheDocument();
  });
});
