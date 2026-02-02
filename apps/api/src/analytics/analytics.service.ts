import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyCode } from '../generated/prisma/enums';

export interface AnalyticsOverviewDto {
  ordersCount: number;
  ordersPaidCount: number;
  totalRevenue: number;
  currency: string;
  campaignsCount: number;
  campaignsActiveCount: number;
  dateFrom?: Date;
  dateTo?: Date;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get overview metrics (orders count, revenue, campaigns). Admin-only.
   */
  async getOverview(
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<AnalyticsOverviewDto> {
    const dateFilter =
      dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          }
        : {};

    const [
      ordersCount,
      ordersPaid,
      revenueResult,
      campaignsCount,
      campaignsActive,
    ] = await Promise.all([
      this.prisma.order.count({ where: dateFilter }),
      this.prisma.order.count({
        where: { ...dateFilter, status: 'PAID' },
      }),
      this.prisma.order.aggregate({
        where: { ...dateFilter, status: 'PAID' },
        _sum: { totalAmount: true },
      }),
      this.prisma.campaign.count({ where: dateFilter }),
      this.prisma.campaign.count({
        where: { ...dateFilter, status: 'ACTIVE' },
      }),
    ]);

    const totalRevenue = Number(revenueResult._sum.totalAmount ?? 0);

    return {
      ordersCount,
      ordersPaidCount: ordersPaid,
      totalRevenue,
      currency: CurrencyCode.NGN,
      campaignsCount,
      campaignsActiveCount: campaignsActive,
      dateFrom: dateFrom ?? undefined,
      dateTo: dateTo ?? undefined,
    };
  }

  /**
   * Export orders as CSV (admin-only). Optional date range.
   */
  async exportOrdersCsv(dateFrom?: Date, dateTo?: Date): Promise<string> {
    const where =
      dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          }
        : {};

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        items: {
          include: {
            product: { select: { name: true } },
            variant: { select: { sku: true } },
          },
        },
      },
    });

    const headers = [
      'id',
      'userId',
      'email',
      'firstName',
      'lastName',
      'status',
      'paymentStatus',
      'totalAmount',
      'currency',
      'createdAt',
    ];
    const rows = orders.map((o) => [
      o.id,
      o.userId,
      o.user?.email ?? '',
      o.user?.firstName ?? '',
      o.user?.lastName ?? '',
      o.status,
      o.paymentStatus,
      o.totalAmount.toString(),
      o.currency,
      o.createdAt.toISOString(),
    ]);

    const escape = (v: string) =>
      v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    const csv =
      headers.join(',') +
      '\n' +
      rows.map((r) => r.map((c) => escape(String(c))).join(',')).join('\n');
    return csv;
  }

  /**
   * Export campaigns as CSV (admin-only). Optional date range.
   */
  async exportCampaignsCsv(dateFrom?: Date, dateTo?: Date): Promise<string> {
    const where =
      dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          }
        : {};

    const campaigns = await this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        organizer: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    const headers = [
      'id',
      'organizerId',
      'organizerEmail',
      'organizerFirstName',
      'organizerLastName',
      'title',
      'slug',
      'status',
      'goalAmount',
      'currentAmount',
      'currency',
      'createdAt',
    ];
    const rows = campaigns.map((c) => [
      c.id,
      c.organizerId,
      c.organizer?.email ?? '',
      c.organizer?.firstName ?? '',
      c.organizer?.lastName ?? '',
      c.title,
      c.slug,
      c.status,
      c.goalAmount?.toString() ?? '',
      c.currentAmount.toString(),
      c.currency,
      c.createdAt.toISOString(),
    ]);

    const escape = (v: string) =>
      v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    const csv =
      headers.join(',') +
      '\n' +
      rows.map((r) => r.map((c) => escape(String(c))).join(',')).join('\n');
    return csv;
  }
}
