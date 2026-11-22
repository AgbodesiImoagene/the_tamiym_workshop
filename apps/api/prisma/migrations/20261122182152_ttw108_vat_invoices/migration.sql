-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "invoiceSellerAddress" TEXT,
ADD COLUMN     "invoiceSellerLegalName" TEXT,
ADD COLUMN     "invoiceSellerTaxNumber" TEXT;

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" "CurrencyCode" NOT NULL,
    "sellerLegalName" TEXT NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "sellerTaxNumber" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerAddress" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotalAmount" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "shippingFee" DECIMAL(10,2) NOT NULL,
    "vatRate" DECIMAL(5,4) NOT NULL,
    "vatAmount" DECIMAL(10,2) NOT NULL,
    "roundingAdjustment" DECIMAL(10,2),
    "pricesIncludeVat" BOOLEAN NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counters" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_orderId_key" ON "invoices"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_sequence_key" ON "invoices"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TTW-108: an issued invoice is immutable. Any UPDATE or DELETE is refused, including the
-- cascade of a deleted order (the foreign key is RESTRICT as well).
-- Rollback (manual):
--   DROP TRIGGER IF EXISTS invoices_immutable ON invoices;
--   DROP FUNCTION IF EXISTS refuse_invoice_change();
CREATE OR REPLACE FUNCTION refuse_invoice_change()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'invoices are immutable: % refused', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_immutable ON invoices;
CREATE TRIGGER invoices_immutable
  BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE PROCEDURE refuse_invoice_change();

-- The counter starts at zero. The issue query also creates it when missing.
INSERT INTO invoice_counters (id, "lastSequence", "updatedAt")
VALUES ('default', 0, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
