'use client';

import { CustomerDashboardShell, formatCurrency } from '@/components/customer-dashboard-shell';
import { customerAssets } from '@/lib/assets';
import { ApiError, User, authApi } from '@/lib/auth';
import { getCustomerOrders } from '@/lib/dashboard';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const fallbackImages = customerAssets.productFallbacks;

export default function DashboardOrdersPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        setUser(await authApi.getMe());
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          router.push('/auth/login');
        } else {
          setError(apiError.message || 'Failed to load user data');
        }
      }
    };

    void fetchUser();
  }, [router]);

  const ordersQuery = useQuery({
    queryKey: ['customer-orders-history'],
    queryFn: getCustomerOrders,
    enabled: !!user,
  });

  const cards = useMemo(() => {
    const orders = ordersQuery.data ?? [];
    if (orders.length > 0) {
      return orders.map((order, index) => ({
        id: order.id,
        title: order.items[0]?.product.name ?? 'Workshop order',
        subtitle: `${order.items.length} item${order.items.length === 1 ? '' : 's'} · ${order.status.replaceAll('_', ' ')}`,
        amount: formatCurrency(Number(order.totalAmount), order.currency),
        image: fallbackImages[index % fallbackImages.length],
      }));
    }

    return fallbackImages.slice(0, 4).map((image, index) => ({
      id: `preview-${index}`,
      title: 'Order preview',
      subtitle: 'Your first order will appear here',
      amount: 'No completed orders yet',
      image,
    }));
  }, [ordersQuery.data]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <CustomerDashboardShell
      activeNav="orders"
      displayName={user?.firstName || user?.email?.split('@')[0] || 'Borngreat'}
    >
      <div className="mt-10 space-y-8 lg:mt-0">
        <div className="space-y-5">
          <h1 className="text-[32px] font-bold tracking-[-0.02em] text-[rgba(0,0,0,0.86)]">
            Orders
          </h1>

          <div className="border-b border-black/10">
            <div className="grid grid-cols-2 text-center text-base font-medium">
              <Link
                href="/dashboard/design"
                className="border-b-[4px] border-transparent pb-3 pt-1 text-black"
              >
                My Designs
              </Link>
              <span className="border-b-[4px] border-[#1e39d2] pb-3 pt-1 text-[#1e39d2]">
                Order History
              </span>
            </div>
          </div>
        </div>

        {ordersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading order history...</p>
        ) : ordersQuery.isError ? (
          <p className="text-sm text-red-700">We could not load your order history.</p>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <article
                key={card.id}
                className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_4px_4px_rgba(0,0,0,0.12)]"
              >
                <div className="relative h-[260px]">
                  <Image
                    src={card.image}
                    alt={card.title}
                    fill
                    className="object-cover"
                    sizes="(min-width: 1280px) 305px, (min-width: 768px) 45vw, 100vw"
                  />
                </div>
                <div className="space-y-3 p-5">
                  <div className="space-y-1">
                    <p className="text-base font-bold">{card.title}</p>
                    <p className="text-sm text-black/70">{card.subtitle}</p>
                    <p className="text-sm font-medium text-black/85">{card.amount}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full bg-[#cfddf8] px-4 py-1.5 text-xs font-medium text-[#0f62fe]"
                  >
                    Order Details
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </CustomerDashboardShell>
  );
}
