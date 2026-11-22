import { StreamableFile } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  AdminOrderInvoiceController,
  OrderInvoiceController,
} from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';

describe('Invoice controllers', () => {
  const download = {
    invoice: { id: 'inv-1' },
    pdf: Buffer.from('%PDF-1.3 test'),
    filename: 'INV-000001.pdf',
  };
  const invoices = {
    getForCustomer: jest.fn(),
    getForAdmin: jest.fn(),
  };
  const res = { setHeader: jest.fn() };

  let customer: OrderInvoiceController;
  let admin: AdminOrderInvoiceController;

  beforeEach(async () => {
    jest.clearAllMocks();
    invoices.getForCustomer.mockResolvedValue(download);
    invoices.getForAdmin.mockResolvedValue(download);
    const module = await Test.createTestingModule({
      controllers: [OrderInvoiceController, AdminOrderInvoiceController],
      providers: [{ provide: InvoicesService, useValue: invoices }],
    }).compile();
    customer = module.get(OrderInvoiceController);
    admin = module.get(AdminOrderInvoiceController);
  });

  it('serves the owner their own PDF as a private attachment', async () => {
    const file = await customer.download(
      { id: 'user-1' } as never,
      'order-1',
      res as never,
    );

    expect(invoices.getForCustomer).toHaveBeenCalledWith('user-1', 'order-1');
    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition: 'attachment; filename="INV-000001.pdf"',
      length: download.pdf.length,
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
  });

  it('serves an admin by order id, with no user scoping', async () => {
    const file = await admin.download('order-9', res as never);

    expect(invoices.getForAdmin).toHaveBeenCalledWith('order-9');
    expect(file.getHeaders().type).toBe('application/pdf');
  });

  it('protects the customer route with the JWT guard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      OrderInvoiceController,
    ) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('restricts the admin route to admins', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminOrderInvoiceController,
    ) as unknown[];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
    expect(Reflect.getMetadata('roles', AdminOrderInvoiceController)).toEqual([
      'ADMIN',
    ]);
  });
});
