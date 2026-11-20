/**
 * TTW-230: reading the product list page by page.
 * The API returns at most 100 products per request and no total.
 */
import { apiClient } from '@/lib/api';
import { getAllDashboardProducts, getDashboardProducts } from '@/lib/products';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn() } }));

const getMock = jest.mocked(apiClient.get);

function products(count: number, from = 0) {
  return Array.from({ length: count }, (_, i) => ({ id: `p${from + i}` }));
}

beforeEach(() => jest.clearAllMocks());

describe('getDashboardProducts', () => {
  it('sends no query string without a filter, as before', async () => {
    getMock.mockResolvedValue([]);
    await getDashboardProducts();
    expect(getMock).toHaveBeenCalledWith('/products');
  });

  it('sends the category, limit and offset it is given', async () => {
    getMock.mockResolvedValue([]);
    await getDashboardProducts({ categorySlug: 'mugs', limit: 5, offset: 10 });
    expect(getMock).toHaveBeenCalledWith('/products?categorySlug=mugs&limit=5&offset=10');
  });
});

describe('getAllDashboardProducts', () => {
  it('stops after a short first page', async () => {
    getMock.mockResolvedValueOnce(products(7));
    const all = await getAllDashboardProducts();
    expect(all).toHaveLength(7);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith('/products?limit=100&offset=0');
  });

  it('walks every page of 100 until a short page', async () => {
    getMock
      .mockResolvedValueOnce(products(100, 0))
      .mockResolvedValueOnce(products(100, 100))
      .mockResolvedValueOnce(products(3, 200));
    const all = await getAllDashboardProducts();
    expect(all).toHaveLength(203);
    expect(getMock).toHaveBeenNthCalledWith(2, '/products?limit=100&offset=100');
    expect(getMock).toHaveBeenNthCalledWith(3, '/products?limit=100&offset=200');
  });

  it('asks again after an exactly full last page, and stops on the empty one', async () => {
    getMock.mockResolvedValueOnce(products(100)).mockResolvedValueOnce([]);
    const all = await getAllDashboardProducts();
    expect(all).toHaveLength(100);
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('stops at the page bound instead of looping forever', async () => {
    getMock.mockResolvedValue(products(100));
    const all = await getAllDashboardProducts();
    expect(getMock.mock.calls.length).toBeLessThanOrEqual(50);
    expect(all.length).toBe(getMock.mock.calls.length * 100);
  });

  it('lets a failing page fail the whole read', async () => {
    getMock.mockResolvedValueOnce(products(100)).mockRejectedValueOnce(new Error('boom'));
    await expect(getAllDashboardProducts()).rejects.toThrow('boom');
  });
});
