-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "actionUrl" TEXT,
ADD COLUMN     "level" TEXT DEFAULT 'info';

-- AlterTable
ALTER TABLE "PropertyLead" ADD COLUMN     "buyerReadAt" TIMESTAMP(3),
ADD COLUMN     "ownerReadAt" TIMESTAMP(3);
