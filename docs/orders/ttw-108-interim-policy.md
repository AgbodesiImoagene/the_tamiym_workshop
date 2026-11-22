# TTW-108 — VAT invoices (interim v1)

**Status:** Implemented-unverified for production use. The client answered "Yes" to Q15 (a VAT-compliant invoice is required). The real seller name, address and tax number are not set yet: until they are, no invoice can be issued.

An invoice is a frozen copy of a paid order. It is issued once, numbered without gaps, and never changes.

## Rules

| Rule              | Value                                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When it is issued | On the first download, by the owner or an admin. Not at payment settlement, so the payment path gains no new failure.                                                                                                                                                           |
| Eligible orders   | `paymentStatus = SUCCEEDED` and status `PAID`, `PROCESSING`, `FULFILLED` or `DELIVERED`, with a VAT snapshot (`vatAmount` and `vatRateSnapshot` set).                                                                                                                           |
| Refused orders    | Unpaid or cancelled orders, orders that have any refund that is not `FAILED` (even if an admin moved the order back to `PROCESSING`), and legacy orders without a VAT snapshot: `400 INVOICE_ORDER_NOT_ELIGIBLE`.                                                               |
| Seller details    | `SiteSettings.invoiceSellerLegalName`, `invoiceSellerAddress`, `invoiceSellerTaxNumber`, edited by an admin under Settings. Any one missing: `409 INVOICE_SELLER_DETAILS_MISSING`.                                                                                              |
| Failed refund     | A refund in state `FAILED` alone does not block an invoice. `FAILED` is not final: a late provider confirmation can still turn it into `SUCCEEDED`. An invoice issued in between stays at the full price, like any invoice followed by a refund; credit notes are out of scope. |
| Already issued    | Stays downloadable whatever the order becomes later (refund included).                                                                                                                                                                                                          |
| Access            | Owner: `GET /v1/orders/:id/invoice`. A foreign or missing order answers 404. Admin: `GET /v1/admin/orders/:id/invoice`.                                                                                                                                                         |
| Format            | PDF, built from the stored row only. Amounts read `NGN 1,234.50`: the built-in PDF font has no naira sign.                                                                                                                                                                      |

## Database guarantees

- `invoices.orderId`, `invoices.number` and `invoices.sequence` are unique: one invoice per order, no reused number.
- Numbers (`INV-000001`, `INV-000002`, ...) come from the one-row `invoice_counters` table, bumped by an atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` in the same transaction as the invoice insert. The issuing transaction first locks the order row (`SELECT ... FOR UPDATE`) and re-checks eligibility and the seller details under that lock, so a refund or cancellation cannot slip in between the check and the insert. A request that loses a race, or whose insert fails, rolls its bump back: no gap. The number reflects the order of issue, not of payment.
- A trigger refuses every `UPDATE` and `DELETE` on `invoices`. The foreign key to `orders` is `RESTRICT`, so an order with an invoice cannot be deleted.
- The row holds a full snapshot: seller, buyer name and address, lines, VAT rate, amounts. Changing a product, a price or the settings later does not reach it.

## Personal data

The buyer name and address are copied into the invoice and kept, because tax records must be retained. The privacy lifecycle (TTW-025) erases the order's shipping snapshot but cannot touch an issued invoice. The retention period and the exact wording for the privacy notice are for the client and legal to confirm (TTW-117).

## Out of scope

Credit notes for refunds, e-invoicing integrations, emailing the invoice, a download button on the admin order screen, translated invoices.
