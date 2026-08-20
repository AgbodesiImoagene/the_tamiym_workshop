-- TTW-026: digested design share links. Revoke legacy plaintext Design.shareToken.

CREATE TABLE "design_share_links" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "design_share_links_tokenHash_key" ON "design_share_links"("tokenHash");
CREATE INDEX "design_share_links_designId_createdAt_idx" ON "design_share_links"("designId", "createdAt");
CREATE INDEX "design_share_links_expiresAt_idx" ON "design_share_links"("expiresAt");

ALTER TABLE "design_share_links" ADD CONSTRAINT "design_share_links_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Legacy plaintext tokens are unsafe; clear them so only digested links work.
UPDATE "designs" SET "shareToken" = NULL, "shareTokenExpiresAt" = NULL WHERE "shareToken" IS NOT NULL;
