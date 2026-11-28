/*
  Warnings:

  - A unique constraint covering the columns `[id,productId]` on the table `product_variants` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "bulk_pricing" DROP CONSTRAINT "bulk_pricing_variantId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_id_productId_key" ON "product_variants"("id", "productId");

-- AddForeignKey
ALTER TABLE "bulk_pricing" ADD CONSTRAINT "bulk_pricing_variantId_productId_fkey" FOREIGN KEY ("variantId", "productId") REFERENCES "product_variants"("id", "productId") ON DELETE CASCADE ON UPDATE CASCADE;
