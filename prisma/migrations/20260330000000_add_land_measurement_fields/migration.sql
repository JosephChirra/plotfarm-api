-- AlterTable: add guntas and landAreaSqFt to Property
ALTER TABLE "Property" ADD COLUMN "guntas" INTEGER;
ALTER TABLE "Property" ADD COLUMN "landAreaSqFt" DECIMAL(65,30);

-- Update existing landUnit default from "sq ft" to "sq_ft"
UPDATE "Property" SET "landUnit" = 'sq_ft' WHERE "landUnit" = 'sq ft';

-- Backfill landAreaSqFt for existing rows where landUnit is known
UPDATE "Property" SET "landAreaSqFt" = "landArea" WHERE "landUnit" = 'sq_ft' OR "landUnit" IS NULL;
UPDATE "Property" SET "landAreaSqFt" = ROUND("landArea" * 43560, 2) WHERE "landUnit" = 'acres';
UPDATE "Property" SET "landAreaSqFt" = ROUND("landArea" * 9, 2) WHERE "landUnit" = 'sq_yards';
UPDATE "Property" SET "landAreaSqFt" = ROUND("landArea" * 107639.1, 2) WHERE "landUnit" = 'hectares';
UPDATE "Property" SET "landAreaSqFt" = ROUND("landArea" * 435.6, 2) WHERE "landUnit" = 'cents';
