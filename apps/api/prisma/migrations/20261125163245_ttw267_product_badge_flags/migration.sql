-- AlterTable
ALTER TABLE "products" ADD COLUMN     "expressProduction" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isBestSeller" BOOLEAN NOT NULL DEFAULT false;
