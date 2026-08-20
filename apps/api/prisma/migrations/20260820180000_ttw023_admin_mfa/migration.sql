-- TTW-023: ADMIN TOTP credentials + hashed recovery codes.
-- Rollback (manual):
--   DROP TABLE IF EXISTS "admin_mfa_recovery_codes";
--   DROP TABLE IF EXISTS "admin_mfa_credentials";

-- CreateTable
CREATE TABLE "admin_mfa_credentials" (
    "userId" TEXT NOT NULL,
    "secretCiphertext" TEXT,
    "secretNonce" TEXT,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "enabledAt" TIMESTAMP(3),
    "pendingSecretCiphertext" TEXT,
    "pendingNonce" TEXT,
    "pendingKeyVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_mfa_credentials_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "admin_mfa_recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_mfa_recovery_codes_codeHash_key" ON "admin_mfa_recovery_codes"("codeHash");

-- CreateIndex
CREATE INDEX "admin_mfa_recovery_codes_userId_idx" ON "admin_mfa_recovery_codes"("userId");

-- AddForeignKey
ALTER TABLE "admin_mfa_credentials" ADD CONSTRAINT "admin_mfa_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_mfa_recovery_codes" ADD CONSTRAINT "admin_mfa_recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_mfa_credentials"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Force ADMIN re-login through MFA: revoke any live admin-surface sessions
-- issued before this cutover (TTW-023 security review).
UPDATE "auth_sessions"
SET "revokedAt" = CURRENT_TIMESTAMP
WHERE "authSurface" = 'ADMIN' AND "revokedAt" IS NULL;
