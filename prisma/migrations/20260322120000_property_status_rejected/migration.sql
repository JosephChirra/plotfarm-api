-- AlterEnum (run alone; value must exist before UPDATE in a follow-up migration)
ALTER TYPE "PropertyStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
