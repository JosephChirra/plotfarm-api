-- Add POST_* credit transaction types (compat: keep LISTING_*).
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'POST_SPEND';
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'POST_REFUND';
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'POST_RENEWAL';
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'EARNED_POST';
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'SPENT_FEATURE_POST';

-- Add post* config fields (compat: keep listing* fields; keep values in sync in app code).
ALTER TABLE "CreditConfig"
  ADD COLUMN IF NOT EXISTS "postCostCredits" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "postVisibilityDays" INTEGER NOT NULL DEFAULT 30;

UPDATE "CreditConfig"
SET
  "postCostCredits" = COALESCE("postCostCredits", "listingCostCredits", 1),
  "postVisibilityDays" = COALESCE("postVisibilityDays", "listingVisibilityDays", 30);

