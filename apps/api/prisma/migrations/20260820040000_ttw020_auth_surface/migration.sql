-- TTW-020: auth surface isolation. Additive only — adds the AuthSurface enum
-- and a nullable authSurface column (+ index) on auth_tokens. Existing refresh
-- tokens remain NULL ("legacy") until revoked or naturally expired; the column
-- becomes meaningful (and, in a later migration, required) once all live
-- sessions are surface-scoped. See docs/14-auth-and-session-architecture.md.
-- Rollback (manual):
--   DROP INDEX IF EXISTS "auth_tokens_authSurface_idx";
--   ALTER TABLE "auth_tokens" DROP COLUMN IF EXISTS "authSurface";
--   DROP TYPE IF EXISTS "AuthSurface";

-- CreateEnum
CREATE TYPE "AuthSurface" AS ENUM ('CUSTOMER', 'ADMIN');

-- AlterTable
ALTER TABLE "auth_tokens" ADD COLUMN "authSurface" "AuthSurface";

-- CreateIndex
CREATE INDEX "auth_tokens_authSurface_idx" ON "auth_tokens"("authSurface");
