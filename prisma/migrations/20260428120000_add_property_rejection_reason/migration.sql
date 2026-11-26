-- Property.rejectionReason exists in schema.prisma but was never migrated; fixes search/list 500s.
ALTER TABLE "Property" ADD COLUMN "rejectionReason" TEXT;
