-- TTW-222: at most one default address per user, enforced by the database.
--
-- Prisma cannot express a partial unique index, so the index is written as raw
-- SQL in this CLI-created migration (same approach as TTW-010 and TTW-012).
--
-- Rollout: runs in one transaction. The table is locked against writes first,
-- so a save cannot add a second default between the clean-up and the index.
-- Compatibility: the application (TTW-219) already keeps one default per user,
-- so the clean-up only touches rows written before that fix.
-- Rollback: DROP INDEX "addresses_one_default_per_user"; the clean-up is not
-- reversible, but it only clears the "default" flag on surplus rows.

-- Give up after 10 s instead of queueing every address write behind a long
-- transaction; the deploy can then be retried.
SET LOCAL lock_timeout = '10s';
LOCK TABLE "addresses" IN SHARE ROW EXCLUSIVE MODE;

-- Where a user has several defaults, keep the most recently updated one (ties:
-- most recently created, then the highest id) and clear the flag on the rest.
-- "updatedAt" is left alone. Running it again changes nothing.
UPDATE "addresses"
SET "isDefault" = false
WHERE "isDefault" = true
  AND "id" NOT IN (
    SELECT DISTINCT ON ("userId") "id"
    FROM "addresses"
    WHERE "isDefault" = true
    ORDER BY "userId", "updatedAt" DESC, "createdAt" DESC, "id" DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS "addresses_one_default_per_user"
ON "addresses" ("userId")
WHERE "isDefault" = true;
