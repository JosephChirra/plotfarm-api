-- CreateTable
CREATE TABLE "PropertyInterest" (
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyInterest_pkey" PRIMARY KEY ("userId","propertyId")
);

-- CreateIndex
CREATE INDEX "PropertyInterest_propertyId_idx" ON "PropertyInterest"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyInterest_userId_idx" ON "PropertyInterest"("userId");

-- AddForeignKey
ALTER TABLE "PropertyInterest" ADD CONSTRAINT "PropertyInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyInterest" ADD CONSTRAINT "PropertyInterest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
