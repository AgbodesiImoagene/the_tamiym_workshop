-- CreateTable
CREATE TABLE "pending_signups" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "signupTokenHash" TEXT NOT NULL,
    "codeHash" TEXT,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_signups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_signups_email_key" ON "pending_signups"("email");

-- CreateIndex
CREATE UNIQUE INDEX "pending_signups_signupTokenHash_key" ON "pending_signups"("signupTokenHash");

-- CreateIndex
CREATE INDEX "pending_signups_expiresAt_idx" ON "pending_signups"("expiresAt");
