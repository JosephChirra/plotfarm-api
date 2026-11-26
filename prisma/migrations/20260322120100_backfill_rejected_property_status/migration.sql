UPDATE "Property"
SET status = 'REJECTED'::"PropertyStatus"
WHERE "verificationStatus" = 'REJECTED';
