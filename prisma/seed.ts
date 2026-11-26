import 'dotenv/config';
import {
  PrismaClient,
  UserRole,
  UserStatus,
  PostType,
  PropertyStatus,
  VerificationStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Set in plotfarm-api/.env — seed creates or resets this admin on every run */
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@plotfarm.com').toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'PlotFarm@Admin2026';

async function main() {
  // Property categories
  await prisma.propertyCategory.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'PLOT' },
  });
  await prisma.propertyCategory.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: 'FARM_LAND' },
  });
  await prisma.propertyCategory.upsert({
    where: { id: 3 },
    update: {},
    create: { id: 3, name: 'COMMERCIAL' },
  });
  await prisma.propertyCategory.upsert({
    where: { id: 4 },
    update: {},
    create: { id: 4, name: 'RENTAL' },
  });

  // Property features
  const featureNames = ['ROAD_ACCESS', 'BOREWELL', 'ELECTRICITY', 'FENCING', 'WATER_SOURCE'];
  for (let i = 0; i < featureNames.length; i++) {
    await prisma.propertyFeature.upsert({
      where: { id: i + 1 },
      update: {},
      create: { id: i + 1, name: featureNames[i] },
    });
  }

  // Plans
  await prisma.plan.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Basic',
      price: 0,
      postLimit: 5,
      validityDays: 365,
    },
  });

  // System config defaults
  await prisma.systemConfig.upsert({
    where: { key: 'monthly_post_limit' },
    update: {},
    create: {
      key: 'monthly_post_limit',
      value: '5',
      description: 'Maximum number of property posts a user can post per calendar month',
    },
  });

  // Admin user (create or reset password from ADMIN_PASSWORD)
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      fullName: 'PlotFarm Admin',
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    create: {
      fullName: 'PlotFarm Admin',
      email: ADMIN_EMAIL,
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  const ownerEmail = 'owner@plotfarm.com';
  const ownerPasswordHash = await bcrypt.hash('PlotFarm@Owner2026', 10);
  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      fullName: 'Demo Property Owner',
      passwordHash: ownerPasswordHash,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    },
    create: {
      fullName: 'Demo Property Owner',
      email: ownerEmail,
      passwordHash: ownerPasswordHash,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    },
  });

  const demoSlug = 'demo-post-hyderabad-farm-land';
  await prisma.property.upsert({
    where: { slug: demoSlug },
    update: {
      ownerId: owner.id,
      categoryId: 2,
      title: 'Demo Farm Land Near Hyderabad',
      description: '5-acre fertile agricultural land with road access and groundwater potential.',
      price: 5000000,
      postType: PostType.SALE,
      propertyType: 'FARM_LAND',
      landArea: 5,
      landUnit: 'acres',
      state: 'telangana',
      district: 'rangareddy',
      mandal: 'shamshabad',
      village: 'kothur',
      contactName: owner.fullName ?? 'Demo Property Owner',
      contactPhone: '9876543210',
      status: PropertyStatus.PUBLISHED,
      verificationStatus: VerificationStatus.VERIFIED,
      isBlocked: false,
      images: [],
    },
    create: {
      ownerId: owner.id,
      categoryId: 2,
      slug: demoSlug,
      title: 'Demo Farm Land Near Hyderabad',
      description: '5-acre fertile agricultural land with road access and groundwater potential.',
      price: 5000000,
      postType: PostType.SALE,
      propertyType: 'FARM_LAND',
      landArea: 5,
      landUnit: 'acres',
      state: 'telangana',
      district: 'rangareddy',
      mandal: 'shamshabad',
      village: 'kothur',
      contactName: owner.fullName ?? 'Demo Property Owner',
      contactPhone: '9876543210',
      status: PropertyStatus.PUBLISHED,
      verificationStatus: VerificationStatus.VERIFIED,
      isBlocked: false,
      images: [],
    },
  });

  const seededPost = await prisma.property.findUnique({
    where: { slug: demoSlug },
    select: { id: true },
  });
  if (seededPost) {
    await prisma.propertyLocation.upsert({
      where: { propertyId: seededPost.id },
      update: {
        district: 'rangareddy',
        state: 'telangana',
        mandal: 'shamshabad',
        village: 'kothur',
        area: 'hyderabad outskirts',
        pincode: '501359',
        formatted_address: 'Kothur, Rangareddy, Telangana 501359',
        latitude: 17.192,
        longitude: 78.223,
      },
      create: {
        propertyId: seededPost.id,
        district: 'rangareddy',
        state: 'telangana',
        mandal: 'shamshabad',
        village: 'kothur',
        area: 'hyderabad outskirts',
        pincode: '501359',
        formatted_address: 'Kothur, Rangareddy, Telangana 501359',
        latitude: 17.192,
        longitude: 78.223,
      },
    });
  }

  // Industry Best Credit & Referral Config
  await prisma.creditConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      signupBonus: 10,
      creditsPerListing: 1,
      referrerReward: 5,
      refereeBonus: 2,
      graceListings: 2,
      referralExpiryDays: 30,
      listingCostCredits: 1,
      listingVisibilityDays: 30,
      newUserGrantListings: 10,
      newUserGrantDays: 30,
      refereeGrantListings: 5,
      fraudAutoHoldScore: 70,
      enableCreditExpiry: true,
      referralTiers: [
        { name: 'Standard', minReferrals: 0, multiplier: 1.0, color: '#64748b' },
        { name: 'Silver', minReferrals: 5, multiplier: 1.2, color: '#94a3b8' },
        { name: 'Gold', minReferrals: 15, multiplier: 1.5, color: '#f59e0b' },
        { name: 'Platinum', minReferrals: 50, multiplier: 2.0, color: '#3b82f6' },
      ],
      campaignBonusMultiplier: 1.0,
      isActive: true,
    },
  });

  console.log('Seed completed');
  console.log('');
  console.log('── Admin login (UI /login) ─────────────────────────────');
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log('  Password: (value of ADMIN_PASSWORD in .env; default if unset: PlotFarm@Admin2026)');
  console.log('  Change ADMIN_PASSWORD in .env and run: npm run prisma:seed');
  console.log('────────────────────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
