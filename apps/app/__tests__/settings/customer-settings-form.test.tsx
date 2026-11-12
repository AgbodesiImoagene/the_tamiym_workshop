/**
 * TTW-192: the shipping address in the settings form is chosen from the state list and
 * the dependent LGA list (TTW-087), never typed.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerSettingsForm } from '@/components/customer-settings-form';
import { getGeoLgas, getGeoStates } from '@/lib/geo';
import {
  changePassword,
  getUserAddresses,
  getUserProfile,
  updateUserProfile,
  upsertPrimaryAddress,
} from '@/lib/profile';

jest.mock('@/lib/geo', () => ({
  ...jest.requireActual('@/lib/geo'),
  getGeoStates: jest.fn(),
  getGeoLgas: jest.fn(),
}));

jest.mock('@/lib/profile', () => ({
  changePassword: jest.fn(),
  getUserAddresses: jest.fn(),
  getUserProfile: jest.fn(),
  updateUserProfile: jest.fn(),
  upsertPrimaryAddress: jest.fn(),
}));

const geoStates = [
  { code: 'LA', name: 'Lagos' },
  { code: 'OG', name: 'Ogun' },
];

const lgasByState: Record<string, Array<{ id: string; name: string }>> = {
  LA: [
    { id: 'lga-ikeja', name: 'Ikeja' },
    { id: 'lga-eti-osa', name: 'Eti-Osa' },
  ],
  OG: [{ id: 'lga-abeokuta', name: 'Abeokuta North' }],
};

const savedAddress = {
  id: 'addr-1',
  addressLine1: '1 Allen Avenue',
  city: 'Ikeja',
  state: 'Lagos',
  stateCode: 'LA',
  lgaId: 'lga-ikeja',
  country: 'Nigeria',
  isDefault: true,
};

// Fake timers make waitFor/findBy count their timeout in fake time, so a busy CPU
// cannot make them give up early (TTW-182).
beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  (getUserProfile as jest.Mock).mockResolvedValue({
    id: 'user-1',
    email: 'buyer@example.com',
    firstName: 'Ada',
    lastName: 'Obi',
    phone: '',
  });
  (getUserAddresses as jest.Mock).mockResolvedValue([savedAddress]);
  (getGeoStates as jest.Mock).mockResolvedValue(geoStates);
  (getGeoLgas as jest.Mock).mockImplementation(async (code: string) => lgasByState[code] ?? []);
  (upsertPrimaryAddress as jest.Mock).mockResolvedValue(savedAddress);
  (updateUserProfile as jest.Mock).mockResolvedValue({});
  (changePassword as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerSettingsForm
        pageTitle="Settings"
        personalTitle="Personal"
        passwordTitle="Password"
        shippingTitle="Shipping"
      />
    </QueryClientProvider>
  );
}

function addressForm() {
  return screen.getByLabelText('Street Address').closest('form') as HTMLFormElement;
}

async function loaded() {
  await waitFor(() =>
    expect(screen.getByLabelText('Street Address')).toHaveValue('1 Allen Avenue')
  );
}

// react-query passes its own context as a second argument; only the payload matters.
function sentPayloads() {
  return (upsertPrimaryAddress as jest.Mock).mock.calls.map(([payload]) => payload);
}

function save() {
  fireEvent.click(within(addressForm()).getByRole('button', { name: 'Save' }));
}

describe('CustomerSettingsForm shipping address', () => {
  it('offers the state as a list, not a text field', async () => {
    renderForm();
    await loaded();

    const state = screen.getByLabelText('State');
    expect(state.tagName).toBe('SELECT');
    await waitFor(() => expect(state).toHaveValue('LA'));
    expect(
      within(state)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Select a state', 'Lagos', 'Ogun']);
    expect(screen.queryByPlaceholderText('Enter state')).not.toBeInTheDocument();
  });

  it('sends state, stateCode and lgaId of a saved address matched to the lists', async () => {
    renderForm();
    await loaded();
    await waitFor(() => expect(screen.getByLabelText('LGA')).toHaveValue('lga-ikeja'));

    save();

    await waitFor(() => expect(upsertPrimaryAddress).toHaveBeenCalledTimes(1));
    expect(sentPayloads()).toEqual([
      {
        country: 'Nigeria',
        state: 'Lagos',
        stateCode: 'LA',
        lgaId: 'lga-ikeja',
        city: 'Ikeja',
        addressLine1: '1 Allen Avenue',
      },
    ]);
  });

  // TTW-193: emptying the LGA select is an explicit request to remove the LGA.
  it('sends lgaId null when the customer empties the LGA of a saved address', async () => {
    renderForm();
    await loaded();
    await waitFor(() => expect(screen.getByLabelText('LGA')).toHaveValue('lga-ikeja'));

    fireEvent.change(screen.getByLabelText('LGA'), { target: { value: '' } });
    save();

    await waitFor(() => expect(upsertPrimaryAddress).toHaveBeenCalledTimes(1));
    expect(sentPayloads()).toEqual([
      {
        country: 'Nigeria',
        state: 'Lagos',
        stateCode: 'LA',
        lgaId: null,
        city: 'Ikeja',
        addressLine1: '1 Allen Avenue',
      },
    ]);
  });

  it('matches a saved state that has only its text, by name', async () => {
    (getUserAddresses as jest.Mock).mockResolvedValue([
      { ...savedAddress, state: 'lagos', stateCode: null, lgaId: null },
    ]);
    renderForm();
    await loaded();
    await waitFor(() => expect(screen.getByLabelText('State')).toHaveValue('LA'));
    expect(screen.queryByText('Choose a state from the list.')).not.toBeInTheDocument();

    save();

    await waitFor(() => expect(upsertPrimaryAddress).toHaveBeenCalledTimes(1));
    expect(sentPayloads()).toEqual([expect.objectContaining({ state: 'Lagos', stateCode: 'LA' })]);
    expect(sentPayloads()[0]).not.toHaveProperty('lgaId');
  });

  it('clears the LGA when another state is chosen, and sends the new choice', async () => {
    renderForm();
    await loaded();
    await waitFor(() => expect(screen.getByLabelText('LGA')).toHaveValue('lga-ikeja'));

    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'OG' } });
    await waitFor(() => expect(getGeoLgas).toHaveBeenCalledWith('OG'));
    await screen.findByRole('option', { name: 'Abeokuta North' });
    expect(screen.getByLabelText('LGA')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('LGA'), { target: { value: 'lga-abeokuta' } });
    save();

    await waitFor(() => expect(upsertPrimaryAddress).toHaveBeenCalledTimes(1));
    expect(sentPayloads()).toEqual([
      {
        country: 'Nigeria',
        state: 'Ogun',
        stateCode: 'OG',
        lgaId: 'lga-abeokuta',
        city: 'Ikeja',
        addressLine1: '1 Allen Avenue',
      },
    ]);
  });

  it('blocks Save and asks for a correction when the saved state is not in the list', async () => {
    (getUserAddresses as jest.Mock).mockResolvedValue([
      { ...savedAddress, state: 'Lagoss', stateCode: null, lgaId: null },
    ]);
    renderForm();
    await loaded();

    expect(await screen.findByText('Choose a state from the list.')).toBeInTheDocument();
    expect(screen.getByLabelText('State')).toHaveValue('');

    save();
    // Validation runs asynchronously: let it settle before checking nothing was sent.
    await screen.findByText('Choose a state from the list.');
    // Validation is asynchronous: let it finish before checking that nothing was sent.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(upsertPrimaryAddress).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'LA' } });
    await waitFor(() =>
      expect(screen.queryByText('Choose a state from the list.')).not.toBeInTheDocument()
    );
    save();
    await waitFor(() => expect(upsertPrimaryAddress).toHaveBeenCalledTimes(1));
    expect(sentPayloads()).toEqual([expect.objectContaining({ state: 'Lagos', stateCode: 'LA' })]);
  });

  it('shows an error and retries when the states cannot be loaded', async () => {
    (getGeoStates as jest.Mock).mockRejectedValueOnce(new Error('network'));
    renderForm();
    await loaded();

    expect(await screen.findByText(/We could not load the states\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByLabelText('State')).toHaveValue('LA'));
    expect(screen.queryByText(/We could not load the states\./)).not.toBeInTheDocument();
  });

  it('shows an error and retries when the LGAs cannot be loaded', async () => {
    (getGeoLgas as jest.Mock).mockRejectedValueOnce(new Error('network'));
    renderForm();
    await loaded();

    expect(await screen.findByText(/We could not load the LGAs\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByRole('option', { name: 'Eti-Osa' });
    expect(screen.queryByText(/We could not load the LGAs\./)).not.toBeInTheDocument();
  });

  it('keeps the LGA select disabled until a state is chosen', async () => {
    (getUserAddresses as jest.Mock).mockResolvedValue([]);
    renderForm();
    await waitFor(() => expect(getGeoStates).toHaveBeenCalled());

    expect(screen.getByLabelText('LGA')).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Select a state first' })).toBeInTheDocument();
  });

  it('does not send a saved LGA that is not in the list of its state', async () => {
    (getUserAddresses as jest.Mock).mockResolvedValue([
      { ...savedAddress, state: 'Lagos', stateCode: 'LA', lgaId: 'lga-abeokuta' },
    ]);
    renderForm();
    await loaded();
    await waitFor(() => expect(screen.getByLabelText('LGA')).toBeEnabled());
    await screen.findByRole('option', { name: 'Eti-Osa' });
    expect(screen.getByLabelText('LGA')).toHaveValue('');

    save();

    await waitFor(() => expect(upsertPrimaryAddress).toHaveBeenCalledTimes(1));
    expect(sentPayloads()[0]).toMatchObject({ state: 'Lagos', stateCode: 'LA' });
    expect(sentPayloads()[0]).not.toHaveProperty('lgaId');
  });

  it('does not send a saved LGA the screen could not show because the LGAs failed to load', async () => {
    (getGeoLgas as jest.Mock).mockRejectedValue(new Error('network'));
    renderForm();
    await loaded();
    await screen.findByText(/We could not load the LGAs\./);

    save();

    await waitFor(() => expect(upsertPrimaryAddress).toHaveBeenCalledTimes(1));
    expect(sentPayloads()[0]).not.toHaveProperty('lgaId');
  });

  it('keeps what the customer typed when the states arrive after the address', async () => {
    let resolveStates: (value: typeof geoStates) => void = () => {};
    (getGeoStates as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveStates = resolve;
      })
    );
    renderForm();
    await loaded();

    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Epe' } });
    await act(async () => {
      resolveStates(geoStates);
    });

    await waitFor(() => expect(screen.getByLabelText('State')).toHaveValue('LA'));
    expect(screen.getByLabelText('City')).toHaveValue('Epe');
  });
});

// TTW-198: optional delivery instructions, plain text, 500 characters at most.
describe('CustomerSettingsForm delivery instructions', () => {
  it('prefills the saved instructions', async () => {
    (getUserAddresses as jest.Mock).mockResolvedValue([
      { ...savedAddress, instructions: 'Ring twice' },
    ]);
    renderForm();
    await loaded();

    expect(screen.getByLabelText('Delivery instructions')).toHaveValue('Ring twice');
  });

  it('limits the field to 500 characters and says it is optional', async () => {
    renderForm();
    await loaded();

    const field = screen.getByLabelText('Delivery instructions');
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveAttribute('maxLength', '500');
    expect(field).not.toBeRequired();
  });

  it('sends the trimmed instructions', async () => {
    renderForm();
    await loaded();
    await waitFor(() => expect(screen.getByLabelText('LGA')).toHaveValue('lga-ikeja'));

    fireEvent.change(screen.getByLabelText('Delivery instructions'), {
      target: { value: '  Leave with the guard\nGate code 4321  ' },
    });
    save();

    await waitFor(() => expect(upsertPrimaryAddress).toHaveBeenCalledTimes(1));
    expect(sentPayloads()[0]).toEqual(
      expect.objectContaining({ instructions: 'Leave with the guard\nGate code 4321' })
    );
  });

  it('sends no instructions for an address that never had any', async () => {
    renderForm();
    await loaded();
    await waitFor(() => expect(screen.getByLabelText('LGA')).toHaveValue('lga-ikeja'));

    save();

    await waitFor(() => expect(upsertPrimaryAddress).toHaveBeenCalledTimes(1));
    expect(sentPayloads()[0]).not.toHaveProperty('instructions');
  });

  it('sends instructions null when the customer empties saved instructions', async () => {
    (getUserAddresses as jest.Mock).mockResolvedValue([
      { ...savedAddress, instructions: 'Ring twice' },
    ]);
    renderForm();
    await loaded();
    await waitFor(() => expect(screen.getByLabelText('LGA')).toHaveValue('lga-ikeja'));

    fireEvent.change(screen.getByLabelText('Delivery instructions'), { target: { value: '   ' } });
    save();

    await waitFor(() => expect(upsertPrimaryAddress).toHaveBeenCalledTimes(1));
    expect(sentPayloads()[0]).toEqual(expect.objectContaining({ instructions: null }));
  });
});
