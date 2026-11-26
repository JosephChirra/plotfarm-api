/*
  Warnings:

  - You are about to drop the column `listingLimit` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `listingType` on the `Property` table. All the data in the column will be lost.
  - Added the required column `postType` to the `Property` table without a default value. This is not possible if the table is not empty.
  - Made the column `landArea` on table `Property` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('SALE', 'RENT', 'LEASE');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('FARM_LAND', 'PLOT');

-- CreateEnum
CREATE TYPE "LandUnit" AS ENUM ('sq_ft', 'acres', 'sq_yards');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('OWNER', 'DEALER');

-- CreateEnum
CREATE TYPE "IrrigationType" AS ENUM ('BOREWELL', 'CANAL', 'RAIN');

-- CreateEnum
CREATE TYPE "PlotFacing" AS ENUM ('EAST', 'WEST', 'NORTH', 'SOUTH');

-- CreateEnum
CREATE TYPE "ReportPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportResolutionAction" ADD VALUE 'TOMBSTONE_PROPERTY';
ALTER TYPE "ReportResolutionAction" ADD VALUE 'FLAG_PROPERTY';
ALTER TYPE "ReportResolutionAction" ADD VALUE 'WARNING';
ALTER TYPE "ReportResolutionAction" ADD VALUE 'TEMP_SUSPEND_USER';
ALTER TYPE "ReportResolutionAction" ADD VALUE 'PERM_BAN_USER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "ReportStatus" ADD VALUE 'ESCALATED';

-- AlterTable
ALTER TABLE "Plan" DROP COLUMN "listingLimit",
ADD COLUMN     "postLimit" INTEGER;

-- AlterTable
ALTER TABLE "Property" DROP COLUMN "listingType",
ADD COLUMN     "contactName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contactPhone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cropHistory" TEXT,
ADD COLUMN     "district" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "electricityAvailable" BOOLEAN,
ADD COLUMN     "gatedCommunity" BOOLEAN,
ADD COLUMN     "irrigationType" "IrrigationType",
ADD COLUMN     "mandal" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "nearbyLandmark" TEXT,
ADD COLUMN     "ownershipType" "OwnershipType" NOT NULL DEFAULT 'OWNER',
ADD COLUMN     "plotFacing" "PlotFacing",
ADD COLUMN     "postType" "PostType" NOT NULL,
ADD COLUMN     "propertyType" "PropertyType" NOT NULL DEFAULT 'FARM_LAND',
ADD COLUMN     "roadAccess" BOOLEAN,
ADD COLUMN     "roadWidth" DECIMAL(65,30),
ADD COLUMN     "soilType" TEXT,
ADD COLUMN     "state" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "village" TEXT,
ADD COLUMN     "waterAvailability" BOOLEAN,
ALTER COLUMN "landArea" SET NOT NULL,
ALTER COLUMN "landUnit" SET DEFAULT 'sq_ft';

-- AlterTable
ALTER TABLE "PropertyLocation" ADD COLUMN     "area" TEXT,
ADD COLUMN     "formatted_address" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "place_id" TEXT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "priority" "ReportPriority" NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "SystemConfig" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "strikeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "suspensionExpiresAt" TIMESTAMP(3),
ADD COLUMN     "trustScore" INTEGER NOT NULL DEFAULT 100;

-- DropEnum
DROP TYPE "ListingType";

-- CreateTable
CREATE TABLE "BlockedUser" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedUser_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "ModerationLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "actionType" "ReportResolutionAction" NOT NULL,
    "reason" TEXT,
    "adminNotes" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockedUser_blockerId_idx" ON "BlockedUser"("blockerId");

-- CreateIndex
CREATE INDEX "BlockedUser_blockedId_idx" ON "BlockedUser"("blockedId");

-- CreateIndex
CREATE INDEX "ModerationLog_adminId_idx" ON "ModerationLog"("adminId");

-- CreateIndex
CREATE INDEX "ModerationLog_targetType_targetId_idx" ON "ModerationLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationLog" ADD CONSTRAINT "ModerationLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
