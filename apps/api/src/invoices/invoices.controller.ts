import {
  Controller,
  Get,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../generated/prisma/enums';
import { InvoicesService, type InvoiceDownload } from './invoices.service';

const PDF_BODY = {
  description: 'The invoice as a PDF file',
  content: {
    'application/pdf': { schema: { type: 'string', format: 'binary' } },
  },
};

/** Send the PDF as a private download. The file name comes from the invoice number only. */
function send(res: Response, file: InvoiceDownload): StreamableFile {
  res.setHeader('Cache-Control', 'private, no-store');
  return new StreamableFile(file.pdf, {
    type: 'application/pdf',
    disposition: `attachment; filename="${file.filename}"`,
    length: file.pdf.length,
  });
}

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderInvoiceController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get(':id/invoice')
  @ApiOperation({
    summary: 'Download the VAT invoice of my paid order',
    description:
      "TTW-108. The invoice is issued on the first download and is the same file afterwards. Another user's order and a missing order both answer 404. An order that is not paid (or has no recorded VAT) answers 400 `INVOICE_ORDER_NOT_ELIGIBLE`; missing seller details answer 409 `INVOICE_SELLER_DETAILS_MISSING`.",
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, ...PDF_BODY })
  @ApiResponse({
    status: 400,
    description: 'Order not eligible for an invoice',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Seller details not set up' })
  async download(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.invoices.getForCustomer(user.id, id));
  }
}

@ApiTags('Admin')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminOrderInvoiceController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get(':id/invoice')
  @ApiOperation({
    summary: 'Download the VAT invoice of any paid order (admin)',
    description:
      'TTW-108. Same file the customer gets. Issues the invoice when none exists yet.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, ...PDF_BODY })
  @ApiResponse({
    status: 400,
    description: 'Order not eligible for an invoice',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Seller details not set up' })
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.invoices.getForAdmin(id));
  }
}
