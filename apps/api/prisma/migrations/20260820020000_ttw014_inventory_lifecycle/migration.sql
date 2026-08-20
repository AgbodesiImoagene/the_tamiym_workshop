-- TTW-014: auditable, exactly-once inventory reserve / release / consume.

CREATE TYPE "InventoryMovementKind" AS ENUM ('RESERVE', 'RELEASE', 'CONSUME');

CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "kind" "InventoryMovementKind" NOT NULL,
    "effectKey" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "quantity" INTEGER NOT NULL,
    "reservedDelta" INTEGER NOT NULL DEFAULT 0,
    "stockOnHandDelta" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_movements_effectKey_key" ON "inventory_movements"("effectKey");
CREATE INDEX "inventory_movements_variantId_createdAt_idx" ON "inventory_movements"("variantId", "createdAt");
CREATE INDEX "inventory_movements_orderId_idx" ON "inventory_movements"("orderId");
CREATE INDEX "inventory_movements_orderItemId_idx" ON "inventory_movements"("orderItemId");
CREATE INDEX "inventory_movements_kind_createdAt_idx" ON "inventory_movements"("kind", "createdAt");

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
