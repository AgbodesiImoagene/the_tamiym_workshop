-- CreateTable
CREATE TABLE "product_likes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_likes_productId_idx" ON "product_likes"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_likes_userId_productId_key" ON "product_likes"("userId", "productId");

-- AddForeignKey
ALTER TABLE "product_likes" ADD CONSTRAINT "product_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_likes" ADD CONSTRAINT "product_likes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
