-- TTW-083: password-reset and email-verification tokens are stored as a
-- SHA-256 digest only. Existing rows hold plaintext tokens (and legacy
-- plaintext REFRESH rows from before TTW-023) that cannot be converted
-- without keeping them readable, so they are removed: outstanding reset and
-- verification links stop working (accepted, not in production). Users
-- request a new link. Hand-written statement; the rest is CLI output from
-- `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`.
DELETE FROM "auth_tokens";

-- DropIndex
DROP INDEX "auth_tokens_token_idx";

-- DropIndex
DROP INDEX "auth_tokens_token_key";

-- AlterTable
ALTER TABLE "auth_tokens" DROP COLUMN "token",
ADD COLUMN     "tokenHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");

