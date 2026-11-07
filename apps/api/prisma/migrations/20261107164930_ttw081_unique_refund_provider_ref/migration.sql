-- TTW-081: one local refund per provider refund id.
-- Stop loudly, before any change, if refunds already share a provider id.
-- Rows are never deleted here: an operator decides which refund owns the id.
DO $$
DECLARE
  duplicates TEXT;
BEGIN
  SELECT string_agg(format('%s/%s (%s rows)', provider, "providerRef", n), ', ')
    INTO duplicates
    FROM (
      SELECT provider, "providerRef", count(*) AS n
        FROM "refunds"
       WHERE "providerRef" IS NOT NULL
       GROUP BY provider, "providerRef"
      HAVING count(*) > 1
    ) d;
  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'TTW-081: refunds share a provider refund id; fix them before migrating: %', duplicates;
  END IF;
END $$;

-- DropIndex
DROP INDEX "refunds_provider_providerRef_idx";

-- CreateIndex
CREATE UNIQUE INDEX "refunds_provider_providerRef_key" ON "refunds"("provider", "providerRef");
