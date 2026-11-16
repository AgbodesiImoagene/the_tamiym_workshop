-- TTW-094: one product-level print-side surcharge per (product, view, currency).
--
-- The existing unique index on (productId, variantId, productViewId, currency)
-- does not protect rows where "variantId" IS NULL, because Postgres treats NULLs
-- as distinct. Product-level rows are exactly what the admin console writes, so
-- a double click or a retry could create two rows and make the price read
-- (`take: 1`) ambiguous. Prisma cannot express a partial index in schema.prisma,
-- so this index exists only in SQL.
--
-- No de-duplication on purpose: if duplicate product-level rows already exist,
-- this statement fails loudly instead of silently deleting price configuration.
CREATE UNIQUE INDEX "product_view_pricing_product_level_key"
  ON "product_view_pricing" ("productId", "productViewId", "currency")
  WHERE "variantId" IS NULL;
