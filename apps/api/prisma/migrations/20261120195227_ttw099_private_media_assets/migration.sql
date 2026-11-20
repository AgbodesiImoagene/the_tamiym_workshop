-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "visibility" "MediaVisibility" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "media_derivatives" ALTER COLUMN "url" DROP NOT NULL;
