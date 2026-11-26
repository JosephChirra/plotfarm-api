"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@plotfarm.com').toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'PlotFarm@Admin2026';
async function main() {
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
    const featureNames = ['ROAD_ACCESS', 'BOREWELL', 'ELECTRICITY', 'FENCING', 'WATER_SOURCE'];
    for (let i = 0; i < featureNames.length; i++) {
        await prisma.propertyFeature.upsert({
            where: { id: i + 1 },
            update: {},
            create: { id: i + 1, name: featureNames[i] },
        });
    }
    await prisma.plan.upsert({
        where: { id: 1 },
        update: {},
        create: {
            id: 1,
            name: 'Basic',
            price: 0,
            listingLimit: 5,
            validityDays: 365,
        },
    });
    await prisma.systemConfig.upsert({
        where: { key: 'monthly_listing_limit' },
        update: {},
        create: {
            key: 'monthly_listing_limit',
            value: '5',
            description: 'Maximum number of property listings a user can post per calendar month',
        },
    });
    const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await prisma.user.upsert({
        where: { email: ADMIN_EMAIL },
        update: {
            fullName: 'PlotFarm Admin',
            passwordHash: adminHash,
            role: client_1.UserRole.ADMIN,
            status: client_1.UserStatus.ACTIVE,
        },
        create: {
            fullName: 'PlotFarm Admin',
            email: ADMIN_EMAIL,
            passwordHash: adminHash,
            role: client_1.UserRole.ADMIN,
            status: client_1.UserStatus.ACTIVE,
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
//# sourceMappingURL=seed.js.map