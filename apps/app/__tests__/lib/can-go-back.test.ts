import { canGoBack } from '@/lib/can-go-back';

type WithNavigation = { navigation?: { canGoBack: boolean } };

describe('canGoBack', () => {
  const originalLength = Object.getOwnPropertyDescriptor(window.history, 'length');

  function setHistoryLength(length: number) {
    Object.defineProperty(window.history, 'length', { value: length, configurable: true });
  }

  afterEach(() => {
    delete (window as unknown as WithNavigation).navigation;
    // The length is an inherited getter in jsdom: drop the own property to restore it.
    if (originalLength) Object.defineProperty(window.history, 'length', originalLength);
    else delete (window.history as unknown as { length?: number }).length;
  });

  it('uses the history length when the browser has no Navigation API', () => {
    setHistoryLength(3);
    expect(canGoBack()).toBe(true);
    setHistoryLength(1);
    expect(canGoBack()).toBe(false);
  });

  it('trusts the Navigation API over the history length', () => {
    // A direct visit still has an earlier entry (another site, a blank tab): length 2.
    setHistoryLength(2);
    (window as unknown as WithNavigation).navigation = { canGoBack: false };
    expect(canGoBack()).toBe(false);

    (window as unknown as WithNavigation).navigation = { canGoBack: true };
    setHistoryLength(1);
    expect(canGoBack()).toBe(true);
  });
});
