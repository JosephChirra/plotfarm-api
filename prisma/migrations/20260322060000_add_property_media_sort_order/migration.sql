-- AlterTable
ALTER TABLE "PropertyMedia" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill order per property (stable gallery sequence)
UPDATE "PropertyMedia" AS pm
SET "sortOrder" = sub.ord
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "propertyId" ORDER BY "createdAt" ASC) - 1 AS ord
  FROM "PropertyMedia"
) AS sub
WHERE pm.id = sub.id;

-- CreateIndex
CREATE INDEX "PropertyMedia_propertyId_sortOrder_idx" ON "PropertyMedia"("propertyId", "sortOrder");
