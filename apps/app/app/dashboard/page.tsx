'use client';

import {
  CustomerDashboardShell,
  GridIcon,
  TruckIcon,
  formatCurrency,
} from '@/components/customer-dashboard-shell';
import { customerAssets } from '@/lib/assets';
import { ApiError, User, authApi } from '@/lib/auth';
import { getCustomerOrders } from '@/lib/dashboard';
import { OrderStatus } from '@tamiym/types';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, cn } from '@tamiym/ui';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M12 3v2.2" />
      <path d="M12 18.8V21" />
      <path d="m4.9 4.9 1.5 1.5" />
      <path d="m17.6 17.6 1.5 1.5" />
      <path d="M3 12h2.2" />
      <path d="M18.8 12H21" />
      <path d="m4.9 19.1 1.5-1.5" />
      <path d="m17.6 6.4 1.5-1.5" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function OrdersGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path d="M10 16H5V7h9v9h-1.5" />
      <path d="M14 10h3l2 2.3V16h-2" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="17.5" cy="17.5" r="1.5" />
    </svg>
  );
}

function PlayButton() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg sm:h-20 sm:w-20">
      <div className="ml-1 h-0 w-0 border-y-[12px] border-y-transparent border-l-[18px] border-l-primary sm:border-y-[14px] sm:border-l-[22px]" />
    </div>
  );
}

function TimelineIcon({
  completed,
  kind,
}: {
  completed: boolean;
  kind: 'box' | 'truck' | 'check';
}) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full border border-border',
        completed ? 'bg-accent text-white' : 'bg-white text-black'
      )}
    >
      {kind === 'box' ? <GridIcon /> : null}
      {kind === 'truck' ? <TruckIcon /> : null}
      {kind === 'check' ? (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m5 12 4 4L19 6" />
        </svg>
      ) : null}
    </div>
  );
}

function getStatusStep(orderStatus?: OrderStatus) {
  if (!orderStatus) {
    return 0;
  }

  if (orderStatus === OrderStatus.DELIVERED) {
    return 3;
  }

  if (orderStatus === OrderStatus.FULFILLED || orderStatus === OrderStatus.PROCESSING) {
    return 2;
  }

  return 1;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

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
      } finally {
        setIsLoadingUser(false);
      }
    };

    void fetchUser();
  }, [router]);

  const ordersQuery = useQuery({
    queryKey: ['customer-orders'],
    queryFn: getCustomerOrders,
    enabled: !!user,
  });

  const dashboardData = useMemo(() => {
    const orders = ordersQuery.data ?? [];
    const latestOrder = orders[0];
    const deliveredCount = orders.filter((order) => order.status === OrderStatus.DELIVERED).length;
    const pendingCount = orders.filter(
      (order) =>
        ![OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(order.status)
    ).length;

    return {
      displayName: user?.firstName || user?.email?.split('@')[0] || 'Borngreat',
      deliveredCount,
      pendingCount,
      latestOrder,
      latestStatusStep: getStatusStep(latestOrder?.status),
      orderCount: orders.length,
    };
  }, [ordersQuery.data, user]);

  if (isLoadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading your dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <CustomerDashboardShell activeNav="home" displayName={dashboardData.displayName}>
      <div className="mt-10 lg:mt-0">
        <div className="grid gap-6 lg:grid-cols-[1fr_134px] lg:items-start">
          <div className="space-y-3">
            <h1 className="max-w-[614px] text-[32px] font-semibold leading-[0.95] tracking-[-0.02em] sm:text-[40px] lg:text-[48px]">
              Welcome To Your Workshop{' '}
              <span className="text-[#1e39d2]">{dashboardData.displayName}!</span>
            </h1>
            <p className="max-w-[614px] text-sm leading-normal sm:text-base">
              Here is everything you need to stay up to date with:
            </p>
          </div>

          <div className="w-full max-w-[160px] rounded-[32px] bg-[#1e39d2] px-6 py-5 text-white">
            <TruckIcon />
            <p className="mt-2 text-[54px] leading-none">
              {String(dashboardData.orderCount).padStart(2, '0')}
            </p>
            <p className="mt-1 text-sm">Orders Placed</p>
          </div>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[433px_minmax(280px,1fr)]">
          <Card className="rounded-[24px] border border-black/25 shadow-[0_4px_4px_rgba(0,0,0,0.25)] lg:rounded-[32px]">
            <CardContent className="space-y-8 px-6 py-8 lg:py-10">
              <div className="flex items-center justify-between">
                <OrdersGlyph />
                <Link href="/dashboard/orders" className="text-sm font-medium">
                  View all
                </Link>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-base font-bold">Orders</p>
                  <p className="text-sm font-medium">Manage and view all your orders</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <span className="rounded-md bg-[#00cb2f] px-3 py-1 text-sm font-bold text-white">
                    {String(dashboardData.deliveredCount).padStart(2, '0')} Delivered
                  </span>
                  <span className="rounded-md bg-[#1e39d2] px-3 py-1 text-sm font-bold text-white">
                    {String(dashboardData.pendingCount).padStart(2, '0')} Pending
                  </span>
                </div>
                {ordersQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading your orders...</p>
                ) : ordersQuery.isError ? (
                  <p className="text-sm text-red-700">We could not load your order summary.</p>
                ) : dashboardData.latestOrder ? (
                  <p className="text-sm text-muted-foreground">
                    Latest order value:{' '}
                    {formatCurrency(
                      Number(dashboardData.latestOrder.totalAmount),
                      dashboardData.latestOrder.currency
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Place your first order to start tracking delivery progress here.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div>
              <p className="text-[18px] font-bold">Recent Order(s)</p>
              <p className="text-sm font-medium">Order tracking timeline</p>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <TimelineIcon completed={dashboardData.latestStatusStep >= 1} kind="box" />
                  <div className="mt-2 h-5 w-px bg-black" />
                </div>
                <div>
                  <p className="text-base font-bold">Order Placed</p>
                  <p className="text-sm font-medium">
                    {dashboardData.latestOrder ? '30min ago' : 'Waiting for your first order'}
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <TimelineIcon completed={dashboardData.latestStatusStep >= 2} kind="truck" />
                  <div className="mt-2 h-7 w-px bg-black" />
                </div>
                <div>
                  <p className="text-base font-bold">Delivering</p>
                  <p className="text-sm font-medium">
                    {dashboardData.latestStatusStep >= 2
                      ? 'Order is on the move'
                      : 'Awaiting dispatch update'}
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <TimelineIcon completed={dashboardData.latestStatusStep >= 3} kind="check" />
                <div>
                  <p className="text-base font-bold">Delivered</p>
                  <p className="text-sm font-medium">
                    {dashboardData.latestStatusStep >= 3
                      ? 'Latest order delivered'
                      : 'Pending completion'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <Card className="rounded-[24px] border border-black/25 shadow-[0_4px_4px_rgba(0,0,0,0.25)] lg:rounded-[32px]">
            <CardContent className="space-y-8 px-6 py-8 lg:py-10">
              <div className="flex items-center justify-between">
                <Image
                  src={customerAssets.profileIcon}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full"
                />
                <Link href="/dashboard/profile" className="text-sm font-medium">
                  edit
                </Link>
              </div>
              <div>
                <p className="text-base font-bold">Profile</p>
                <p className="text-sm font-medium">Manage your personal information</p>
                <p className="mt-3 text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border border-black/25 shadow-[0_4px_4px_rgba(0,0,0,0.25)] lg:rounded-[32px]">
            <CardContent className="space-y-8 px-6 py-8 lg:py-10">
              <div className="flex items-center justify-between">
                <SettingsIcon />
                <Link href="/dashboard/settings" className="text-sm font-medium">
                  manage
                </Link>
              </div>
              <div>
                <p className="text-base font-bold">Settings</p>
                <p className="text-sm font-medium">
                  Update your password and set your delivery location
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                    Password
                  </span>
                  <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                    Delivery
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <section className="mt-12">
          <h2 className="text-[22px] font-semibold lg:text-[32px]">Quick Tutorial Videos</h2>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {[
              { title: 'How to use the Design Lab', image: customerAssets.tutorialVideoOne },
              { title: 'How to place orders', image: customerAssets.tutorialVideoTwo },
            ].map((video) => (
              <div
                key={video.title}
                className="overflow-hidden rounded-[24px] border border-black/25 shadow-[0_4px_4px_rgba(0,0,0,0.25)]"
              >
                <div className="relative flex h-[260px] items-center justify-center sm:h-[283px]">
                  <Image
                    src={video.image}
                    alt={video.title}
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 436px, 343px"
                  />
                  <div className="absolute inset-0 bg-black/10" />
                  <div className="relative z-10">
                    <PlayButton />
                  </div>
                </div>
                <div className="flex h-[56px] items-center justify-center bg-white px-4 text-center text-sm font-semibold tracking-[0.04em]">
                  {video.title}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </CustomerDashboardShell>
  );
}
