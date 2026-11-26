/*
  Warnings:

  - You are about to drop the column `plotFacing` on the `Property` table. All the data in the column will be lost.
  - You are about to drop the column `roadWidth` on the `Property` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PlotFacing" ADD VALUE 'NORTH_EAST';
ALTER TYPE "PlotFacing" ADD VALUE 'NORTH_WEST';
ALTER TYPE "PlotFacing" ADD VALUE 'SOUTH_EAST';
ALTER TYPE "PlotFacing" ADD VALUE 'SOUTH_WEST';

-- AlterTable
ALTER TABLE "Property" DROP COLUMN "plotFacing",
DROP COLUMN "roadWidth";

-- CreateTable
CREATE TABLE "PropertyFacing" (
    "id" SERIAL NOT NULL,
    "propertyId" TEXT NOT NULL,
    "direction" "PlotFacing" NOT NULL,
    "roadWidth" DECIMAL(65,30),

    CONSTRAINT "PropertyFacing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyFacing_propertyId_idx" ON "PropertyFacing"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyFacing_direction_idx" ON "PropertyFacing"("direction");

-- AddForeignKey
ALTER TABLE "PropertyFacing" ADD CONSTRAINT "PropertyFacing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
