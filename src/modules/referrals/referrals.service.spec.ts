import { CreditTransactionType, ReferralStatus } from "@prisma/client";
import { ReferralsService } from "./referrals.service";

function buildTx(record: {
  id: string;
  referrerId: string;
  refereeId: string;
  status: ReferralStatus;
  expiresAt: Date;
  referrerReward: number;
  refereeReward: number;
}) {
  let claimCount = 0;
  return {
    property: {
      count: jest.fn(async () => 1),
    },
    referralRecord: {
      findUnique: jest.fn(async () => ({ ...record })),
      count: jest.fn(async () => 0),
      updateMany: jest.fn(async () => {
        claimCount += 1;
        return { count: claimCount === 1 ? 1 : 0 };
      }),
    },
    creditConfig: {
      findFirst: jest.fn(async () => ({
        referralTiers: [],
        referrerReward: 2,
        refereeBonus: 1,
        campaignStartAt: null,
        campaignEndAt: null,
        campaignBonusMultiplier: 1.0,
      })),
    },
    creditTransaction: {
      findFirst: jest.fn(async () => null),
    },
  };
}

describe("ReferralsService first-property rewards", () => {
  it("concurrent completion only issues one reward pair", async () => {
    const refereeId = "referee-1";
    const record = {
      id: "ref-1",
      referrerId: "referrer-1",
      refereeId,
      status: ReferralStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
      referrerReward: 2,
      refereeReward: 1,
    };

    const tx = buildTx(record);
    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      referralRecord: {
        findUnique: jest.fn(async () => ({
          referrerId: record.referrerId,
          refereeId: record.refereeId,
          referrerReward: 2,
          refereeReward: 1,
        })),
      },
    } as any;
    const creditsService = {
      creditTokens: jest.fn(async (_userId: string, dto: any) => ({
        id: dto.idempotencyKey,
        type: dto.type,
      })),
    } as any;
    const notificationsService = {
      sendNotification: jest.fn(async () => ({})),
    } as any;

    const service = new ReferralsService(
      prisma,
      creditsService,
      notificationsService,
    );

    await Promise.all([
      service.completeReferralOnFirstProperty(refereeId),
      service.completeReferralOnFirstProperty(refereeId),
    ]);

    expect(creditsService.creditTokens).toHaveBeenCalledTimes(1);
    expect(creditsService.creditTokens).toHaveBeenCalledWith(
      "referrer-1",
      expect.objectContaining({
        type: CreditTransactionType.REFERRAL_REWARD,
        idempotencyKey: "referral:reward:ref-1:referrer",
      }),
      expect.any(Object),
    );
  });

  it("skips referrer credit when legacy join-time REFERRAL_REWARD already exists", async () => {
    const refereeId = "referee-2";
    const record = {
      id: "ref-2",
      referrerId: "referrer-2",
      refereeId,
      status: ReferralStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
      referrerReward: 2,
      refereeReward: 1,
    };

    const tx = buildTx(record);
    (tx.creditTransaction as any).findFirst = jest.fn(
      async ({ where }: any) => {
        if (
          where?.userId === "referrer-2" &&
          where?.type === CreditTransactionType.REFERRAL_REWARD
        ) {
          return { id: "legacy-referrer-pay" };
        }
        return null;
      },
    );

    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      referralRecord: {
        findUnique: jest.fn(async () => ({
          referrerId: record.referrerId,
          refereeId: record.refereeId,
          referrerReward: 2,
          refereeReward: 1,
        })),
      },
    } as any;
    const creditsService = {
      creditTokens: jest.fn(async (_userId: string, dto: any) => ({
        id: dto.idempotencyKey,
        type: dto.type,
      })),
    } as any;
    const notificationsService = {
      sendNotification: jest.fn(async () => ({})),
    } as any;

    const service = new ReferralsService(
      prisma,
      creditsService,
      notificationsService,
    );

    await service.completeReferralOnFirstProperty(refereeId);

    expect(creditsService.creditTokens).toHaveBeenCalledTimes(0);
  });
});
