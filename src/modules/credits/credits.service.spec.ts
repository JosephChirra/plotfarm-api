import { BadRequestException } from "@nestjs/common";
import {
  CreditTransactionType,
  WalletTransactionDirection,
} from "@prisma/client";
import { CreditsService } from "./credits.service";

describe("CreditsService idempotency", () => {
  const userId = "user-1";

  function buildServiceWithTx(tx: any) {
    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as any;
    return {
      service: new CreditsService(prisma),
      prisma,
    };
  }

  it("double API call with same key creates one transaction", async () => {
    const createdTx = {
      id: "txn-1",
      userId,
      idempotencyKey: "op:1",
      amount: 3,
      direction: WalletTransactionDirection.CREDIT,
    };
    let existing: any = null;
    const tx = {
      creditTransaction: {
        findFirst: jest.fn(async ({ where }: any) => {
          // idempotency lookup path
          if (
            where?.idempotencyKey &&
            existing?.idempotencyKey === where.idempotencyKey
          )
            return existing;
          if (
            where?.idempotencyKey?.in &&
            Array.isArray(where.idempotencyKey.in)
          ) {
            if (where.idempotencyKey.in.includes(existing?.idempotencyKey))
              return existing;
          }
          // reconciliation path (orderBy desc): no historical txns in this unit test
          return null;
        }),
        create: jest.fn(async () => {
          existing = createdTx;
          return createdTx;
        }),
      },
      user: { update: jest.fn(async () => ({ id: userId })) },
      $queryRaw: jest.fn(async () => [{ creditBalance: 10 }]),
    };
    const { service } = buildServiceWithTx(tx);

    const one = await service.creditTokens(userId, {
      amount: 3,
      type: CreditTransactionType.ADMIN_CREDIT,
      idempotencyKey: "op:1",
      source: "TEST",
    });
    const two = await service.creditTokens(userId, {
      amount: 3,
      type: CreditTransactionType.ADMIN_CREDIT,
      idempotencyKey: "op:1",
      source: "TEST",
    });

    expect(one.id).toBe("txn-1");
    expect(two.id).toBe("txn-1");
    expect(tx.creditTransaction.create).toHaveBeenCalledTimes(1);
  });

  it("retry after unique-conflict returns existing transaction safely", async () => {
    const existingTx = {
      id: "txn-existing",
      userId,
      idempotencyKey: "retry:1",
      amount: 5,
      direction: WalletTransactionDirection.CREDIT,
    };
    let findPhase = 0;
    const tx = {
      creditTransaction: {
        findFirst: jest.fn(async () => {
          findPhase += 1;
          // 1: pre-write idempotency miss; 2: post-P2002 recovery hit
          return findPhase >= 2 ? existingTx : null;
        }),
        create: jest.fn(async () => {
          const err: any = new Error("unique");
          err.code = "P2002";
          throw err;
        }),
      },
      user: { update: jest.fn(async () => ({ id: userId })) },
      $queryRaw: jest.fn(async () => [{ creditBalance: 10 }]),
    };
    const { service } = buildServiceWithTx(tx);

    const out = await service.creditTokens(userId, {
      amount: 5,
      type: CreditTransactionType.ADMIN_CREDIT,
      idempotencyKey: "retry:1",
      source: "TEST",
    });
    expect(out.id).toBe("txn-existing");
  });

  it("legacy listing debit key dedupes post debit", async () => {
    const createdTx = {
      id: "listing-txn-1",
      userId,
      idempotencyKey: "post:debit:prop-1",
      amount: 1,
      direction: WalletTransactionDirection.DEBIT,
    };
    let existing: any = null;
    const tx = {
      creditTransaction: {
        findFirst: jest.fn(async ({ where }: any) => {
          const probe = where?.idempotencyKey;
          if (typeof probe === "string" && existing?.idempotencyKey === probe)
            return existing;
          if (
            probe?.in &&
            Array.isArray(probe.in) &&
            probe.in.includes(existing?.idempotencyKey)
          )
            return existing;
          return null;
        }),
        create: jest.fn(async () => {
          existing = createdTx;
          return createdTx;
        }),
      },
      user: { update: jest.fn(async () => ({ id: userId })) },
      $queryRaw: jest.fn(async () => [{ creditBalance: 10 }]),
    };
    const { service } = buildServiceWithTx(tx);

    await service.debitTokens(userId, {
      amount: 1,
      type: CreditTransactionType.POST_SPEND,
      idempotencyKey: "post:debit:prop-1",
      source: "POST_DEBIT",
    });
    await service.debitTokens(userId, {
      amount: 1,
      type: CreditTransactionType.POST_SPEND,
      idempotencyKey: "listing:debit:prop-1",
      source: "LISTING_DEBIT",
    });

    expect(tx.creditTransaction.create).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
  });

  it("duplicate refund key does not create duplicate refunds", async () => {
    const createdTx = {
      id: "refund-txn-1",
      userId,
      idempotencyKey: "refund:orig-1",
      amount: 2,
      direction: WalletTransactionDirection.CREDIT,
    };
    let existing: any = null;
    const tx = {
      creditTransaction: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (
            where?.idempotencyKey &&
            existing?.idempotencyKey === where.idempotencyKey
          )
            return existing;
          if (
            where?.idempotencyKey?.in &&
            Array.isArray(where.idempotencyKey.in)
          ) {
            if (where.idempotencyKey.in.includes(existing?.idempotencyKey))
              return existing;
          }
          return null;
        }),
        create: jest.fn(async () => {
          existing = createdTx;
          return createdTx;
        }),
      },
      user: { update: jest.fn(async () => ({ id: userId })) },
      $queryRaw: jest.fn(async () => [{ creditBalance: 10 }]),
    };
    const { service } = buildServiceWithTx(tx);

    await service.creditTokens(userId, {
      amount: 2,
      type: CreditTransactionType.POST_REFUND,
      idempotencyKey: "refund:orig-1",
      source: "POST_REFUND",
    });
    await service.creditTokens(userId, {
      amount: 2,
      type: CreditTransactionType.POST_REFUND,
      idempotencyKey: "refund:orig-1",
      source: "POST_REFUND",
    });

    expect(tx.creditTransaction.create).toHaveBeenCalledTimes(1);
  });

  it("prevents negative balance on debit", async () => {
    const tx = {
      creditTransaction: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(),
      },
      user: { update: jest.fn(async () => ({ id: userId })) },
      $queryRaw: jest.fn(async () => [{ creditBalance: 0 }]),
    };
    const { service } = buildServiceWithTx(tx);

    await expect(
      service.debitTokens(userId, {
        amount: 2,
        type: CreditTransactionType.POST_SPEND,
        idempotencyKey: "post:debit:prop-2",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
