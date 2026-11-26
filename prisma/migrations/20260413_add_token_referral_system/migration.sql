-- CreateEnum
CREATE TYPE "TokenTransactionType" AS ENUM ('EARNED_REFERRAL', 'EARNED_WELCOME', 'EARNED_LISTING', 'EARNED_PROFILE_COMPLETE', 'SPENT_FEATURE_LISTING', 'SPENT_CONTACT_REVEAL', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'EXPIRED', 'FRAUDULENT');

-- CreateEnum
CREATE TYPE "WalletTransactionDirection" AS ENUM ('CREDIT', 'DEBIT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "tokenBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TokenTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TokenTransactionType" NOT NULL,
    "direction" "WalletTransactionDirection" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "referralId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralRecord" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "qualifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "referrerReward" INTEGER NOT NULL DEFAULT 0,
    "refereeReward" INTEGER NOT NULL DEFAULT 0,
    "fraudScore" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralConfig" (
    "id" TEXT NOT NULL,
    "referrerRewardTokens" INTEGER NOT NULL DEFAULT 50,
    "refereeWelcomeTokens" INTEGER NOT NULL DEFAULT 25,
    "qualifyingAction" TEXT NOT NULL DEFAULT 'FIRST_LISTING',
    "expiryDays" INTEGER NOT NULL DEFAULT 30,
    "maxReferralsPerUser" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TokenTransaction_userId_idx" ON "TokenTransaction"("userId");

-- CreateIndex
CREATE INDEX "TokenTransaction_type_idx" ON "TokenTransaction"("type");

-- CreateIndex
CREATE INDEX "TokenTransaction_createdAt_idx" ON "TokenTransaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralRecord_refereeId_key" ON "ReferralRecord"("refereeId");

-- CreateIndex
CREATE INDEX "ReferralRecord_referrerId_idx" ON "ReferralRecord"("referrerId");

-- CreateIndex
CREATE INDEX "ReferralRecord_referralCode_idx" ON "ReferralRecord"("referralCode");

-- CreateIndex
CREATE INDEX "ReferralRecord_status_idx" ON "ReferralRecord"("status");

-- CreateIndex
CREATE INDEX "ReferralRecord_createdAt_idx" ON "ReferralRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "ReferralRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralRecord" ADD CONSTRAINT "ReferralRecord_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralRecord" ADD CONSTRAINT "ReferralRecord_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

