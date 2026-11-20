-- CreateEnum
CREATE TYPE "ShippingRateBracketBasis" AS ENUM ('WEIGHT_GRAMS', 'QUANTITY');

-- AlterTable
ALTER TABLE "shipping_rates" ADD COLUMN     "bracketBasis" "ShippingRateBracketBasis";

-- CreateTable
CREATE TABLE "shipping_rate_brackets" (
    "id" TEXT NOT NULL,
    "rateId" TEXT NOT NULL,
    "minValue" INTEGER NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_rate_brackets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipping_rate_brackets_rateId_minValue_key" ON "shipping_rate_brackets"("rateId", "minValue");

-- AddForeignKey
ALTER TABLE "shipping_rate_brackets" ADD CONSTRAINT "shipping_rate_brackets_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "shipping_rates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
