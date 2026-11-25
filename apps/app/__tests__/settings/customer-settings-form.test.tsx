/**
 * TTW-192: the shipping address in the settings form is chosen from the state list and
 * the dependent LGA list (TTW-087), never typed.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerSettingsForm } from '@/components/customer-settings-form';
import { canGoBack } from '@/lib/can-go-back';
import { getGeoLgas, getGeoStates } from '@/lib/geo';
import {
  changePassword,
  getUserAddresses,
  getUserProfile,
  updateUserProfile,
  upsertPrimaryAddress,
} from '@/lib/profile';

const back = jest.fn();
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ back, push, replace: jest.fn() }),
}));

jest.mock('@/lib/can-go-back', () => ({ canGoBack: jest.fn() }));

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

function renderForm(pageTitle = 'Settings') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerSettingsForm
        pageTitle={pageTitle}
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

// TTW-091: the demo photo and the inactive upload button are gone, on both pages that
// use this form (Profile and Settings).
describe.each(['Profile', 'Settings'])('CustomerSettingsForm on the %s page', (pageTitle) => {
  it('shows no profile picture and no picture button', async () => {
    renderForm(pageTitle);
    await loaded();

    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /profile picture/i })).not.toBeInTheDocument();
  });

  it('still shows the personal details fields', async () => {
    renderForm(pageTitle);
    await loaded();

    expect(screen.getByLabelText('First Name')).toHaveValue('Ada');
    expect(screen.getByLabelText('Surname')).toHaveValue('Obi');
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Phone')).toBeInTheDocument();
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

// TTW-229: the chevron at the top of the page goes back. Whether there is a page to go
// back to is decided by `canGoBack` (see __tests__/lib/can-go-back.test.ts).
describe('CustomerSettingsForm back button', () => {
  it('has an accessible name', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
  });

  it('goes back in the history when there is a previous page of the site', () => {
    (canGoBack as jest.Mock).mockReturnValue(true);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));

    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('goes to the dashboard when the page was opened directly', () => {
    (canGoBack as jest.Mock).mockReturnValue(false);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));

    expect(push).toHaveBeenCalledWith('/dashboard');
    expect(back).not.toHaveBeenCalled();
  });
});

// TTW-264: saving the personal details used to fail for anyone without a phone number (the
// form sent an empty phone, which the API refuses) and the refusal was never shown. The phone
// is a country (calling code) next to a field that takes digits only; the form builds the
// international number the API wants.
describe('CustomerSettingsForm personal details', () => {
  function personalForm() {
    return screen.getByLabelText('First Name').closest('form') as HTMLFormElement;
  }
  function saveDetails() {
    fireEvent.click(within(personalForm()).getByRole('button', { name: 'Save' }));
  }
  const phoneInput = () => screen.getByLabelText('Phone') as HTMLInputElement;
  const countrySelect = () => screen.getByLabelText('Country calling code') as HTMLSelectElement;
  const profilePayloads = () => (updateUserProfile as jest.Mock).mock.calls.map(([p]) => p);

  it('saves a new name for a customer with no phone, and sends no phone at all', async () => {
    renderForm('Profile');
    await loaded();

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Adaeze' } });
    saveDetails();

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledTimes(1));
    expect(profilePayloads()[0]).toEqual({ firstName: 'Adaeze', lastName: 'Obi' });
    expect(profilePayloads()[0]).not.toHaveProperty('phone');
  });

  it('offers the countries in alphabetical order with their calling code, Nigeria selected', async () => {
    renderForm('Profile');
    await loaded();

    expect(countrySelect()).toHaveValue('NG');
    const options = within(countrySelect()).getAllByRole('option');
    const names = options.map((o) => (o.textContent ?? '').replace(/ \(\+\d+\)$/, ''));
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
    expect(options[0]).toHaveTextContent(/^Afghanistan \(\+93\)$/);
    expect(
      within(countrySelect()).getByRole('option', { name: 'United Kingdom (+44)' })
    ).toBeInTheDocument();
    expect(options.length).toBeGreaterThan(200);
  });

  describe('country search', () => {
    const search = () => screen.getByLabelText('Search country code') as HTMLInputElement;
    const optionValues = () =>
      within(countrySelect())
        .getAllByRole('option')
        .map((o) => (o as HTMLOptionElement).value);

    it('lists only the countries with that calling code, and keeps the chosen one', async () => {
      renderForm('Profile');
      await loaded();

      fireEvent.change(search(), { target: { value: '+44' } });

      expect(optionValues().sort()).toEqual(['GB', 'GG', 'IM', 'JE', 'NG']);
      expect(countrySelect()).toHaveValue('NG');
    });

    it('selects the country when the code belongs to one country only', async () => {
      renderForm('Profile');
      await loaded();

      fireEvent.change(search(), { target: { value: '33' } });

      expect(countrySelect()).toHaveValue('FR');
      expect(optionValues()).toEqual(['FR']);
    });

    it('also finds a country by its name', async () => {
      renderForm('Profile');
      await loaded();

      fireEvent.change(search(), { target: { value: 'kingd' } });

      expect(optionValues()).toContain('GB');
      expect(optionValues()).not.toContain('FR');
    });

    it('says so when nothing matches, and shows the full list again when cleared', async () => {
      renderForm('Profile');
      await loaded();

      fireEvent.change(search(), { target: { value: '999' } });
      expect(screen.getByText('No country matches.')).toBeInTheDocument();

      fireEvent.change(search(), { target: { value: '' } });
      expect(screen.queryByText('No country matches.')).not.toBeInTheDocument();
      expect(optionValues().length).toBeGreaterThan(200);
    });

    it('builds the number with the country found by its code', async () => {
      renderForm('Profile');
      await loaded();

      fireEvent.change(search(), { target: { value: '33' } });
      fireEvent.change(phoneInput(), { target: { value: '612345678' } });
      saveDetails();

      await waitFor(() => expect(updateUserProfile).toHaveBeenCalledTimes(1));
      expect(profilePayloads()[0].phone).toBe('+33612345678');
    });
  });

  it('keeps the country selector narrow so the phone field stays on its line', async () => {
    renderForm('Profile');
    await loaded();

    expect(countrySelect().className).not.toMatch(/(^|\s)w-full(\s|$)/);
    expect(countrySelect().className).toContain('shrink-0');
    expect(phoneInput().className).toContain('flex-1');
  });

  it('keeps only digits in the field', async () => {
    renderForm('Profile');
    await loaded();

    fireEvent.change(phoneInput(), { target: { value: 'abc +234 (801)-23' } });
    expect(phoneInput().value).toBe('23480123');
  });

  it('builds the international number from the country and the digits', async () => {
    renderForm('Profile');
    await loaded();

    fireEvent.change(phoneInput(), { target: { value: '8012345678' } });
    saveDetails();

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledTimes(1));
    expect(profilePayloads()[0]).toEqual({
      firstName: 'Ada',
      lastName: 'Obi',
      phone: '+2348012345678',
    });
  });

  it('turns a local number with its leading 0 into the international one', async () => {
    renderForm('Profile');
    await loaded();

    fireEvent.change(phoneInput(), { target: { value: '08012345678' } });
    saveDetails();

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledTimes(1));
    expect(profilePayloads()[0].phone).toBe('+2348012345678');
  });

  it('uses the country that was chosen', async () => {
    renderForm('Profile');
    await loaded();

    fireEvent.change(countrySelect(), { target: { value: 'GB' } });
    fireEvent.change(phoneInput(), { target: { value: '7911123456' } });
    saveDetails();

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledTimes(1));
    expect(profilePayloads()[0].phone).toBe('+447911123456');
  });

  it('shows a saved number as its country and its digits', async () => {
    (getUserProfile as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'buyer@example.com',
      firstName: 'Ada',
      lastName: 'Obi',
      phone: '+442079460958',
    });
    renderForm('Profile');
    await loaded();

    await waitFor(() => expect(countrySelect()).toHaveValue('GB'));
    expect(phoneInput()).toHaveValue('2079460958');
  });

  it('refuses a number that is not valid for the country and sends nothing', async () => {
    renderForm('Profile');
    await loaded();

    fireEvent.change(phoneInput(), { target: { value: '123' } });
    saveDetails();

    expect(
      await screen.findByText(/valid phone number for the selected country/i)
    ).toBeInTheDocument();
    expect(updateUserProfile).not.toHaveBeenCalled();
  });

  it('shows the refusal of the API instead of failing silently', async () => {
    (updateUserProfile as jest.Mock).mockRejectedValue({
      message: 'Something went wrong on our side',
      statusCode: 500,
    });
    renderForm('Profile');
    await loaded();

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Adaeze' } });
    saveDetails();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side');
    expect(within(personalForm()).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('explains a phone refused by the API', async () => {
    (updateUserProfile as jest.Mock).mockRejectedValue({
      message: ['phone must be a valid phone number'],
      statusCode: 400,
    });
    renderForm('Profile');
    await loaded();

    fireEvent.change(phoneInput(), { target: { value: '8012345678' } });
    saveDetails();

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid phone number/i);
  });
});
