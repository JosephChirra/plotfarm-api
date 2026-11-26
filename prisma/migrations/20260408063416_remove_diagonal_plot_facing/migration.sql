/*
  Warnings:

  - The values [NORTH_EAST,NORTH_WEST,SOUTH_EAST,SOUTH_WEST] on the enum `PlotFacing` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PlotFacing_new" AS ENUM ('EAST', 'WEST', 'NORTH', 'SOUTH');
ALTER TABLE "PropertyFacing" ALTER COLUMN "direction" TYPE "PlotFacing_new" USING ("direction"::text::"PlotFacing_new");
ALTER TYPE "PlotFacing" RENAME TO "PlotFacing_old";
ALTER TYPE "PlotFacing_new" RENAME TO "PlotFacing";
DROP TYPE "PlotFacing_old";
COMMIT;
