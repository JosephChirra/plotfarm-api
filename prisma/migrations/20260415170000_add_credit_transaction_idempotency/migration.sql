-- Add idempotency tracking fields for wallet ledger writes.
ALTER TABLE "CreditTransaction"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "source" TEXT;

-- Global uniqueness when key is present.
CREATE UNIQUE INDEX "CreditTransaction_idempotencyKey_key"
ON "CreditTransaction"("idempotencyKey");

-- Lookup accelerator for user-scoped idempotency checks.
CREATE INDEX "CreditTransaction_userId_idempotencyKey_idx"
ON "CreditTransaction"("userId", "idempotencyKey");
