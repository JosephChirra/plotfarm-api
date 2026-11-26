-- CreateTable
CREATE TABLE IF NOT EXISTS "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- Seed default monthly listing limit
INSERT INTO "SystemConfig" ("key", "value", "description", "updatedAt")
VALUES ('monthly_listing_limit', '5', 'Maximum number of property listings a user can post per calendar month', NOW())
ON CONFLICT ("key") DO NOTHING;
