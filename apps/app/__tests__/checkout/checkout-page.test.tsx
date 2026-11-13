/**
 * TTW-037: the standard checkout keeps one order per cart revision across retries,
 * sends designs per line, and never clears the cart before payment settles.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DashboardCheckoutPage from '@/app/dashboard/checkout/page';
import { addCartItem, getCart, setCartPendingOrder, type CartItem } from '@/lib/cart-store';
import { createOrder, initiateOrderPayment, quoteOrder } from '@/lib/checkout';
import { getGeoLgas, getGeoStates } from '@/lib/geo';
import { getUserAddresses, upsertPrimaryAddress } from '@/lib/profile';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
}));

jest.mock('@/components/customer-dashboard-shell', () => ({
  CustomerDashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount}`,
}));

jest.mock('@/lib/auth', () => ({
  authApi: {
    getMe: jest.fn().mockResolvedValue({ id: 'user-1', email: 'buyer@example.com' }),
  },
}));

jest.mock('@/lib/checkout', () => ({
  createOrder: jest.fn(),
  initiateOrderPayment: jest.fn(),
  quoteOrder: jest.fn(),
}));

jest.mock('@/lib/geo', () => ({
  ...jest.requireActual('@/lib/geo'),
  getGeoStates: jest.fn(),
  getGeoLgas: jest.fn(),
}));

jest.mock('@/lib/profile', () => ({
  getUserAddresses: jest.fn(),
  upsertPrimaryAddress: jest.fn(),
}));

const savedAddress = {
  id: 'addr-1',
  recipientName: 'Ada',
  phone: '+2348000000000',
  addressLine1: '1 Allen Avenue',
  addressLine2: null,
  city: 'Ikeja',
  state: 'Lagos',
  postalCode: null,
  country: 'Nigeria',
  isDefault: true,
};

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

const quote = {
  currency: 'NGN',
  subtotalAmount: 5000,
  discountAmount: 0,
  shippingFee: 2000,
  vatAmount: 0,
  totalAmount: 7000,
};

const futureIso = () => new Date(Date.now() + 30 * 60 * 1000).toISOString();

function pendingOrder(id = 'order-1') {
  return { id, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', expiresAt: futureIso() };
}

function cartLine(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'prod-1',
    productName: 'Classic Tee',
    variantId: 'var-1',
    variantName: 'Small / Red',
    optionSummary: 'Size: Small',
    quantity: 1,
    unitPrice: 5000,
    currency: 'NGN',
    imageUrl: null,
    ...overrides,
  };
}

// jsdom cannot navigate to the Paystack URL and reports it through console.error;
// the redirect itself is covered by the Playwright journey.
const consoleError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const [first] = args;
    const message = first instanceof Error ? first.message : String(first);
    if (message.includes('Not implemented: navigation')) return;
    consoleError(...args);
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Fake timers make waitFor/findBy count their timeout in fake time (Testing Library
// advances it 50 ms per check), so a busy CPU cannot make them give up early (TTW-182).
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  // clearAllMocks keeps unconsumed `...Once` values: after a failed test they would leak
  // into the next one and turn one failure into several (TTW-182).
  (createOrder as jest.Mock).mockReset();
  (initiateOrderPayment as jest.Mock).mockReset();
  (quoteOrder as jest.Mock).mockReset();
  (getGeoStates as jest.Mock).mockReset();
  (getGeoLgas as jest.Mock).mockReset();
  window.localStorage.clear();
  (getGeoStates as jest.Mock).mockResolvedValue(geoStates);
  (getGeoLgas as jest.Mock).mockImplementation(async (code: string) => lgasByState[code] ?? []);
  (getUserAddresses as jest.Mock).mockResolvedValue([savedAddress]);
  (upsertPrimaryAddress as jest.Mock).mockResolvedValue(savedAddress);
  (quoteOrder as jest.Mock).mockResolvedValue(quote);
});

afterEach(() => {
  jest.useRealTimers();
});

function renderCheckout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardCheckoutPage />
    </QueryClientProvider>
  );
}

async function reviewQuote() {
  await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('Ikeja'));
  fireEvent.click(screen.getByRole('button', { name: 'Review quote' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Place order and pay' })).toBeEnabled()
  );
}

async function placeOrder() {
  const calls = (createOrder as jest.Mock).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Place order and pay' }));
  await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(calls + 1));
  await waitFor(() => expect(screen.queryByText('Redirecting...')).not.toBeInTheDocument());
}

function sentKeys(): string[] {
  return (createOrder as jest.Mock).mock.calls.map(([input]) => input.idempotencyKey);
}

describe('DashboardCheckoutPage', () => {
  it('reuses the idempotency key and keeps the cart when payment initiation fails and the customer clicks again', async () => {
    addCartItem(cartLine());
    (createOrder as jest.Mock).mockResolvedValue(pendingOrder());
    (initiateOrderPayment as jest.Mock)
      .mockRejectedValueOnce({ message: 'Paystack is unavailable' })
      .mockResolvedValueOnce({ authorizationUrl: 'https://checkout.paystack.test/abc' });

    renderCheckout();
    await reviewQuote();

    await placeOrder();
    await screen.findByText('Paystack is unavailable');
    expect(getCart()?.lines).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Place order and pay' }));
    await waitFor(() => expect(initiateOrderPayment).toHaveBeenCalledTimes(2));

    const keys = sentKeys();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toEqual(expect.any(String));
    expect(keys[1]).toBe(keys[0]);
    expect(keys[0]).toBe(getCart()?.idempotencyKey);
    expect(getCart()?.lines).toHaveLength(1);
    expect(getCart()?.pendingOrderId).toBe('order-1');
  });

  it('sends each saved design as its own line', async () => {
    addCartItem(cartLine({ designId: 'des-1' }));
    addCartItem(cartLine({ designId: 'des-2', quantity: 2 }));
    (createOrder as jest.Mock).mockResolvedValue(pendingOrder());
    (initiateOrderPayment as jest.Mock).mockResolvedValue({
      authorizationUrl: 'https://checkout.paystack.test/abc',
    });

    renderCheckout();
    await reviewQuote();
    await placeOrder();

    const expectedItems = [
      { variantId: 'var-1', designId: 'des-1', quantity: 1 },
      { variantId: 'var-1', designId: 'des-2', quantity: 2 },
    ];
    expect(quoteOrder).toHaveBeenCalledWith(expect.objectContaining({ items: expectedItems }));
    await waitFor(() =>
      expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ items: expectedItems }))
    );
  });

  it('requires a new quote after an address edit and then uses a new key', async () => {
    addCartItem(cartLine());
    (createOrder as jest.Mock).mockResolvedValue(pendingOrder());
    (initiateOrderPayment as jest.Mock)
      .mockRejectedValueOnce({ message: 'Paystack is unavailable' })
      .mockResolvedValueOnce({ authorizationUrl: 'https://checkout.paystack.test/abc' });

    renderCheckout();
    await reviewQuote();
    await placeOrder();
    await screen.findByText('Paystack is unavailable');

    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Lekki' } });
    expect(screen.getByRole('button', { name: 'Place order and pay' })).toBeDisabled();

    (upsertPrimaryAddress as jest.Mock).mockResolvedValue({ ...savedAddress, city: 'Lekki' });
    fireEvent.click(screen.getByRole('button', { name: 'Review quote' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Place order and pay' })).toBeEnabled()
    );
    expect(upsertPrimaryAddress).toHaveBeenLastCalledWith(
      expect.objectContaining({ city: 'Lekki' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Place order and pay' }));
    await waitFor(() => expect(initiateOrderPayment).toHaveBeenCalledTimes(2));

    const keys = sentKeys();
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('does not restart payment on an expired order and rotates the key', async () => {
    addCartItem(cartLine());
    (createOrder as jest.Mock).mockResolvedValue({
      id: 'order-1',
      status: 'CANCELLED',
      paymentStatus: 'PENDING',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    renderCheckout();
    await reviewQuote();
    await placeOrder();

    await screen.findByText(/previous order expired/i);
    expect(initiateOrderPayment).not.toHaveBeenCalled();
    expect(getCart()?.idempotencyKey).not.toBe(sentKeys()[0]);
    expect(getCart()?.pendingOrderId).toBeNull();
    expect(getCart()?.lines).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Place order and pay' })).toBeDisabled();
  });

  // Expiry is decided by the server (review finding 2): the device clock may be wrong.
  it('rotates the key when the server reports the payment window expired', async () => {
    addCartItem(cartLine());
    (createOrder as jest.Mock).mockResolvedValue(pendingOrder());
    (initiateOrderPayment as jest.Mock).mockRejectedValue({
      statusCode: 400,
      code: 'PAYMENT_WINDOW_EXPIRED',
      message: 'Order payment window has expired',
    });

    renderCheckout();
    await reviewQuote();
    await placeOrder();

    await screen.findByText(/previous order expired/i);
    expect(getCart()?.idempotencyKey).not.toBe(sentKeys()[0]);
    expect(getCart()?.pendingOrderId).toBeNull();
    expect(screen.getByRole('button', { name: 'Place order and pay' })).toBeDisabled();
  });

  it('does not judge expiry with the device clock', async () => {
    addCartItem(cartLine());
    // A device clock running 45 minutes fast sees a fresh order as already expired.
    (createOrder as jest.Mock).mockResolvedValue({
      ...pendingOrder(),
      expiresAt: new Date(Date.now() - 15 * 60_000).toISOString(),
    });
    (initiateOrderPayment as jest.Mock).mockResolvedValue({
      authorizationUrl: 'https://checkout.paystack.test/abc',
    });

    renderCheckout();
    await reviewQuote();
    await placeOrder();

    await waitFor(() =>
      expect(initiateOrderPayment).toHaveBeenCalledWith('order-1', 'buyer@example.com')
    );
    expect(screen.queryByText(/previous order expired/i)).not.toBeInTheDocument();
    expect(getCart()?.idempotencyKey).toBe(sentKeys()[0]);
  });

  // Review finding 1: the address of a previous attempt must survive a reload.
  it('uses a new key when the address changes after a reload with a pending order', async () => {
    addCartItem(cartLine());
    setCartPendingOrder('order-previous');
    const keyBeforeReload = getCart()?.idempotencyKey;
    (createOrder as jest.Mock).mockResolvedValue(pendingOrder('order-2'));
    (initiateOrderPayment as jest.Mock).mockResolvedValue({
      authorizationUrl: 'https://checkout.paystack.test/abc',
    });

    renderCheckout();
    await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('Ikeja'));
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Lekki' } });
    (upsertPrimaryAddress as jest.Mock).mockResolvedValue({ ...savedAddress, city: 'Lekki' });
    fireEvent.click(screen.getByRole('button', { name: 'Review quote' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Place order and pay' })).toBeEnabled()
    );
    await placeOrder();

    expect(sentKeys()[0]).not.toBe(keyBeforeReload);
  });

  // TTW-009: addresses already cached (e.g. back navigation) still prefill the form.
  it('prefills the saved address when the addresses are already cached on mount', async () => {
    addCartItem(cartLine());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['checkout-addresses'], [savedAddress]);

    render(
      <QueryClientProvider client={client}>
        <DashboardCheckoutPage />
      </QueryClientProvider>
    );

    expect(screen.getByLabelText('City')).toHaveValue('Ikeja');
    expect(screen.getByLabelText('Street Address')).toHaveValue('1 Allen Avenue');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review quote' })).toBeEnabled());
  });

  // Review finding 6: the API refuses a known key sent with different content.
  it('starts a new revision when the API reports the key was used for other content', async () => {
    addCartItem(cartLine());
    (createOrder as jest.Mock).mockRejectedValue({
      statusCode: 409,
      code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
      message: 'This idempotency key was already used with different order content',
    });

    renderCheckout();
    await reviewQuote();
    await placeOrder();

    await screen.findByText('Your cart or address changed. Review the quote again.');
    expect(getCart()?.idempotencyKey).not.toBe(sentKeys()[0]);
    expect(getCart()?.lines).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Place order and pay' })).toBeDisabled();
    expect(initiateOrderPayment).not.toHaveBeenCalled();
  });

  // Review finding 5: a quote is only valid for the cart revision it was computed for.
  it('requires a new quote when the cart changes in another tab', async () => {
    addCartItem(cartLine());

    renderCheckout();
    await reviewQuote();

    act(() => {
      addCartItem(cartLine({ variantId: 'var-2', productName: 'Hoodie' }));
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Place order and pay' })).toBeDisabled()
    );
    expect(createOrder).not.toHaveBeenCalled();
  });

  // Independent review finding 2: a paid replay must not wipe a newer cart revision.
  it('keeps a cart changed in another tab when the replayed order is already paid', async () => {
    addCartItem(cartLine());
    (createOrder as jest.Mock).mockImplementation(async () => {
      addCartItem(cartLine({ variantId: 'var-2', productName: 'Hoodie' }));
      return { id: 'order-1', status: 'PAID', paymentStatus: 'SUCCEEDED', expiresAt: null };
    });

    renderCheckout();
    await reviewQuote();
    await placeOrder();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/orders/order-1/confirm'));
    expect(getCart()?.lines).toHaveLength(2);
  });

  // Review finding 4: an order belongs to the cart revision it was created for.
  it('does not tag a cart changed in another tab with the order of the previous revision', async () => {
    addCartItem(cartLine());
    (createOrder as jest.Mock).mockImplementation(async () => {
      // Another tab adds a line while the create request is in flight.
      addCartItem(cartLine({ variantId: 'var-2', productName: 'Hoodie' }));
      return pendingOrder();
    });
    (initiateOrderPayment as jest.Mock).mockResolvedValue({
      authorizationUrl: 'https://checkout.paystack.test/abc',
    });

    renderCheckout();
    await reviewQuote();
    await placeOrder();

    expect(getCart()?.lines).toHaveLength(2);
    expect(getCart()?.pendingOrderId).toBeNull();
  });

  it('sends the customer to the confirmation page when the order is already paid', async () => {
    addCartItem(cartLine());
    (createOrder as jest.Mock).mockResolvedValue({
      id: 'order-1',
      status: 'PAID',
      paymentStatus: 'SUCCEEDED',
      expiresAt: null,
    });

    renderCheckout();
    await reviewQuote();
    await placeOrder();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/orders/order-1/confirm'));
    expect(initiateOrderPayment).not.toHaveBeenCalled();
    expect(getCart()?.lines ?? []).toHaveLength(0);
  });

  describe('order note (TTW-197)', () => {
    const noteField = () => screen.getByLabelText(/Order note/);

    it('offers an optional note limited to 500 characters with a counter', async () => {
      addCartItem(cartLine());
      renderCheckout();
      await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('Ikeja'));

      expect(noteField()).toHaveAttribute('maxlength', '500');
      expect(screen.getByText('0 / 500')).toBeInTheDocument();
      fireEvent.change(noteField(), { target: { value: 'Pack apart' } });
      expect(screen.getByText('10 / 500')).toBeInTheDocument();
    });

    it('sends the trimmed note with the order', async () => {
      addCartItem(cartLine());
      (createOrder as jest.Mock).mockResolvedValue(pendingOrder());
      (initiateOrderPayment as jest.Mock).mockResolvedValue({
        authorizationUrl: 'https://checkout.paystack.test/abc',
      });
      renderCheckout();
      await reviewQuote();
      fireEvent.change(noteField(), { target: { value: '  Logo slightly smaller \n' } });
      await placeOrder();

      expect((createOrder as jest.Mock).mock.calls[0][0].customerNote).toBe(
        'Logo slightly smaller'
      );
    });

    it('sends no note when the field is empty or blank', async () => {
      addCartItem(cartLine());
      (createOrder as jest.Mock).mockResolvedValue(pendingOrder());
      (initiateOrderPayment as jest.Mock).mockResolvedValue({
        authorizationUrl: 'https://checkout.paystack.test/abc',
      });
      renderCheckout();
      await reviewQuote();
      fireEvent.change(noteField(), { target: { value: '   ' } });
      await placeOrder();

      expect((createOrder as jest.Mock).mock.calls[0][0].customerNote).toBeUndefined();
    });

    it('keeps the key when the same note is sent again', async () => {
      addCartItem(cartLine());
      (createOrder as jest.Mock).mockResolvedValue(pendingOrder());
      (initiateOrderPayment as jest.Mock)
        .mockRejectedValueOnce({ message: 'Paystack is unavailable' })
        .mockResolvedValueOnce({ authorizationUrl: 'https://checkout.paystack.test/abc' });
      renderCheckout();
      await reviewQuote();
      fireEvent.change(noteField(), { target: { value: 'Same note' } });
      await placeOrder();
      await screen.findByText('Paystack is unavailable');
      fireEvent.click(screen.getByRole('button', { name: 'Place order and pay' }));
      await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(2));

      const keys = sentKeys();
      expect(keys[1]).toBe(keys[0]);
    });

    it('uses a new key when the note changes after an order was created', async () => {
      addCartItem(cartLine());
      (createOrder as jest.Mock).mockResolvedValue(pendingOrder());
      (initiateOrderPayment as jest.Mock)
        .mockRejectedValueOnce({ message: 'Paystack is unavailable' })
        .mockResolvedValueOnce({ authorizationUrl: 'https://checkout.paystack.test/abc' });
      renderCheckout();
      await reviewQuote();
      fireEvent.change(noteField(), { target: { value: 'First note' } });
      await placeOrder();
      await screen.findByText('Paystack is unavailable');

      fireEvent.change(noteField(), { target: { value: 'Edited note' } });
      fireEvent.click(screen.getByRole('button', { name: 'Place order and pay' }));
      await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(2));

      const calls = (createOrder as jest.Mock).mock.calls;
      expect(calls[1][0].customerNote).toBe('Edited note');
      expect(calls[1][0].idempotencyKey).not.toBe(calls[0][0].idempotencyKey);
    });

    it('warns that changing the note after an order was created starts a new order', async () => {
      addCartItem(cartLine());
      (createOrder as jest.Mock).mockResolvedValue(pendingOrder());
      (initiateOrderPayment as jest.Mock).mockRejectedValue({ message: 'Paystack is unavailable' });
      renderCheckout();
      await reviewQuote();
      fireEvent.change(noteField(), { target: { value: 'First note' } });
      await placeOrder();
      await screen.findByText('Paystack is unavailable');

      const warning = /Changing the note will create a new order/;
      expect(screen.queryByText(warning)).not.toBeInTheDocument();
      fireEvent.change(noteField(), { target: { value: 'Edited note' } });
      expect(screen.getByText(warning)).toBeInTheDocument();
      fireEvent.change(noteField(), { target: { value: 'First note' } });
      expect(screen.queryByText(warning)).not.toBeInTheDocument();
    });

    it('shows no warning before any order exists', async () => {
      addCartItem(cartLine());
      renderCheckout();
      await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('Ikeja'));
      fireEvent.change(noteField(), { target: { value: 'A note' } });
      expect(
        screen.queryByText(/Changing the note will create a new order/)
      ).not.toBeInTheDocument();
    });

    it('does not store the note in the cart or in local storage', async () => {
      addCartItem(cartLine());
      renderCheckout();
      await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('Ikeja'));
      fireEvent.change(noteField(), { target: { value: 'PRIVATE-NOTE-TEXT' } });

      expect(JSON.stringify({ ...window.localStorage })).not.toContain('PRIVATE-NOTE-TEXT');
    });
  });

  describe('address outside every shipping zone (TTW-086)', () => {
    const notCovered = {
      statusCode: 400,
      code: 'SHIPPING_ADDRESS_NOT_COVERED',
      message: 'server wording',
    };
    const shownMessage = /We don't deliver to this address yet/;

    it('explains the refused quote, shows no shipping price and keeps the cart', async () => {
      addCartItem(cartLine());
      (quoteOrder as jest.Mock).mockRejectedValueOnce(notCovered);

      renderCheckout();
      await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('Ikeja'));
      fireEvent.click(screen.getByRole('button', { name: 'Review quote' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(shownMessage);
      expect(screen.getAllByText('Quote first')).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'Place order and pay' })).toBeDisabled();
      expect(getCart()?.lines).toHaveLength(1);
    });

    it('quotes again once the customer corrects the address', async () => {
      addCartItem(cartLine());
      (quoteOrder as jest.Mock).mockRejectedValueOnce(notCovered);

      renderCheckout();
      await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('Ikeja'));
      fireEvent.click(screen.getByRole('button', { name: 'Review quote' }));
      await screen.findByRole('alert');

      // TTW-087: the state is a list now, so the correction picks another state.
      fireEvent.change(screen.getByLabelText('State'), { target: { value: 'OG' } });
      await reviewQuote();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('NGN 2000')).toBeInTheDocument();
    });

    it('explains a refused order without clearing the cart or redirecting', async () => {
      addCartItem(cartLine());
      (createOrder as jest.Mock).mockRejectedValueOnce(notCovered);

      renderCheckout();
      await reviewQuote();
      await placeOrder();

      expect(await screen.findByRole('alert')).toHaveTextContent(shownMessage);
      expect(screen.getByRole('button', { name: 'Place order and pay' })).toBeDisabled();
      expect(initiateOrderPayment).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(getCart()?.lines).toHaveLength(1);
      expect(getCart()?.pendingOrderId ?? null).toBeNull();
    });
  });

  // TTW-087: the state is chosen from our list, never typed.
  describe('state and LGA lists (TTW-087)', () => {
    it('offers the states as a list instead of a text field', async () => {
      addCartItem(cartLine());
      renderCheckout();

      const state = await screen.findByRole('combobox', { name: 'State' });
      await waitFor(() => expect(screen.getByRole('option', { name: 'Ogun' })).toBeInTheDocument());
      expect(state.tagName).toBe('SELECT');
      expect(screen.queryByPlaceholderText('Enter state')).not.toBeInTheDocument();
    });

    it('selects the saved state by name when the saved address has no state code', async () => {
      addCartItem(cartLine());
      renderCheckout();

      const state = await screen.findByRole('combobox', { name: 'State' });
      await waitFor(() => expect(state).toHaveValue('LA'));
      await waitFor(() => expect(getGeoLgas).toHaveBeenCalledWith('LA'));
    });

    it('loads the LGAs of the chosen state and clears the LGA when the state changes', async () => {
      addCartItem(cartLine());
      (getUserAddresses as jest.Mock).mockResolvedValue([
        { ...savedAddress, stateCode: 'LA', lgaId: 'lga-ikeja' },
      ]);
      renderCheckout();

      const lga = await screen.findByRole('combobox', { name: 'LGA' });
      await waitFor(() => expect(lga).toHaveValue('lga-ikeja'));

      fireEvent.change(screen.getByRole('combobox', { name: 'State' }), {
        target: { value: 'OG' },
      });
      await waitFor(() => expect(getGeoLgas).toHaveBeenCalledWith('OG'));
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Abeokuta North' })).toBeInTheDocument()
      );
      expect(screen.getByRole('combobox', { name: 'LGA' })).toHaveValue('');
      expect(screen.queryByRole('option', { name: 'Ikeja' })).not.toBeInTheDocument();
    });

    it('saves the chosen state name, state code and LGA', async () => {
      addCartItem(cartLine());
      renderCheckout();
      await reviewQuote();

      fireEvent.change(screen.getByRole('combobox', { name: 'State' }), {
        target: { value: 'OG' },
      });
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Abeokuta North' })).toBeInTheDocument()
      );
      fireEvent.change(screen.getByRole('combobox', { name: 'LGA' }), {
        target: { value: 'lga-abeokuta' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Review quote' }));

      await waitFor(() =>
        expect(upsertPrimaryAddress).toHaveBeenLastCalledWith(
          expect.objectContaining({ state: 'Ogun', stateCode: 'OG', lgaId: 'lga-abeokuta' })
        )
      );
    });

    // TTW-193: emptying the LGA select removes the LGA saved on the address.
    it('sends lgaId null when the customer empties the LGA of a saved address', async () => {
      addCartItem(cartLine());
      (getUserAddresses as jest.Mock).mockResolvedValue([
        { ...savedAddress, stateCode: 'LA', lgaId: 'lga-ikeja' },
      ]);
      renderCheckout();

      const lga = await screen.findByRole('combobox', { name: 'LGA' });
      await waitFor(() => expect(lga).toHaveValue('lga-ikeja'));
      fireEvent.change(lga, { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Review quote' }));

      await waitFor(() =>
        expect(upsertPrimaryAddress).toHaveBeenLastCalledWith(
          expect.objectContaining({ stateCode: 'LA', lgaId: null })
        )
      );
    });

    it('sends no lgaId when the saved address had none and the LGA stays empty', async () => {
      addCartItem(cartLine());
      renderCheckout();
      await reviewQuote();

      const payload = (upsertPrimaryAddress as jest.Mock).mock.calls.at(-1)?.[0];
      expect(payload).not.toHaveProperty('lgaId');
    });

    it('asks for a correction when the saved state is not in the list', async () => {
      addCartItem(cartLine());
      (getUserAddresses as jest.Mock).mockResolvedValue([{ ...savedAddress, state: 'Lagoss' }]);
      renderCheckout();

      await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('Ikeja'));
      expect(await screen.findByText('Choose a state from the list.')).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'State' })).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Review quote' })).toBeDisabled();

      fireEvent.change(screen.getByRole('combobox', { name: 'State' }), {
        target: { value: 'LA' },
      });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Review quote' })).toBeEnabled()
      );
      expect(screen.queryByText('Choose a state from the list.')).not.toBeInTheDocument();
    });

    it('shows an error with a retry when the states cannot be loaded', async () => {
      addCartItem(cartLine());
      (getGeoStates as jest.Mock).mockRejectedValueOnce(new Error('offline'));
      renderCheckout();

      expect(await screen.findByText('We could not load the states.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Review quote' })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Lagos' })).toBeInTheDocument()
      );
      expect(screen.queryByText('We could not load the states.')).not.toBeInTheDocument();
    });

    it('shows an error with a retry when the LGAs cannot be loaded', async () => {
      addCartItem(cartLine());
      (getGeoLgas as jest.Mock).mockRejectedValueOnce(new Error('offline'));
      renderCheckout();

      expect(await screen.findByText('We could not load the LGAs.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Ikeja' })).toBeInTheDocument()
      );
    });
  });
});

// TTW-198: optional delivery instructions, plain text, 500 characters at most.
describe('delivery instructions (TTW-198)', () => {
  it('prefills the saved instructions and limits the field to 500 characters', async () => {
    addCartItem(cartLine());
    (getUserAddresses as jest.Mock).mockResolvedValue([
      { ...savedAddress, instructions: 'Ring twice' },
    ]);
    renderCheckout();

    const field = await screen.findByLabelText('Delivery instructions');
    await waitFor(() => expect(field).toHaveValue('Ring twice'));
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveAttribute('maxLength', '500');
    expect(field).not.toBeRequired();
  });

  it('saves the trimmed instructions with the address', async () => {
    addCartItem(cartLine());
    renderCheckout();
    await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('Ikeja'));

    fireEvent.change(screen.getByLabelText('Delivery instructions'), {
      target: { value: '  Leave with the guard  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review quote' }));

    await waitFor(() =>
      expect(upsertPrimaryAddress).toHaveBeenLastCalledWith(
        expect.objectContaining({ instructions: 'Leave with the guard' })
      )
    );
  });

  it('sends no instructions when the address has none and the field stays empty', async () => {
    addCartItem(cartLine());
    renderCheckout();
    await reviewQuote();

    const payload = (upsertPrimaryAddress as jest.Mock).mock.calls.at(-1)?.[0];
    expect(payload).not.toHaveProperty('instructions');
  });

  it('sends instructions null when the customer empties saved instructions', async () => {
    addCartItem(cartLine());
    (getUserAddresses as jest.Mock).mockResolvedValue([
      { ...savedAddress, instructions: 'Ring twice' },
    ]);
    renderCheckout();

    const field = await screen.findByLabelText('Delivery instructions');
    await waitFor(() => expect(field).toHaveValue('Ring twice'));
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review quote' }));

    await waitFor(() =>
      expect(upsertPrimaryAddress).toHaveBeenLastCalledWith(
        expect.objectContaining({ instructions: null })
      )
    );
  });

  it('uses a new key when only the instructions change after a quote', async () => {
    addCartItem(cartLine());
    (createOrder as jest.Mock).mockResolvedValue(pendingOrder());
    (initiateOrderPayment as jest.Mock).mockRejectedValue(new Error('gateway down'));
    renderCheckout();
    await reviewQuote();
    await placeOrder();

    fireEvent.change(screen.getByLabelText('Delivery instructions'), {
      target: { value: 'Call on arrival' },
    });
    await reviewQuote();
    await placeOrder();

    const keys = sentKeys();
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });
});
