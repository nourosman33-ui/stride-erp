import { CashFlowService } from "./cash-flow.service";

function makeService(overrides: {
  cashCount?: any;
  cashSales?: number;
  cashRefunds?: number;
  cashExpenses?: number;
  pending?: { count: number; amount: number };
} = {}) {
  const prisma = {
    cashCount: {
      findUnique: jest.fn().mockResolvedValue(overrides.cashCount ?? null),
      upsert: jest.fn((args: any) => ({ id: "cc-1", ...args.create, ...args.update })),
    },
  };
  const finance = {
    getPaymentMethodBreakdown: jest.fn().mockResolvedValue({
      cash: overrides.cashSales ?? 0,
      card: 0,
      mobile_wallet: 0,
      bank_transfer: 0,
    }),
    getRefundsByMethod: jest.fn().mockResolvedValue({
      cash: overrides.cashRefunds ?? 0,
      card: 0,
      mobile_wallet: 0,
      bank_transfer: 0,
    }),
  };
  const expenseAnalytics = {
    getWindowAnalytics: jest.fn().mockResolvedValue({
      byPaymentMethod: { cash: overrides.cashExpenses ?? 0, card: 0, mobile_wallet: 0, bank_transfer: 0 },
    }),
  };
  const expenses = {
    getPendingSummary: jest.fn().mockResolvedValue(overrides.pending ?? { count: 0, amount: 0 }),
  };
  const service = new CashFlowService(prisma as any, finance as any, expenseAnalytics as any, expenses as any);
  return { service, prisma, finance, expenseAnalytics, expenses };
}

describe("CashFlowService", () => {
  describe("computeCashFlow — expected closing cash formula", () => {
    it("computes Opening + Cash Sales - Cash Refunds - Cash Expenses with no count recorded", async () => {
      const { service } = makeService({ cashSales: 2000, cashRefunds: 300, cashExpenses: 150 });
      const result = await service.computeCashFlow("store-1", new Date("2026-08-10"));
      expect(result.openingCash).toBe(0);
      expect(result.expectedClosingCash).toBe(2000 - 300 - 150);
      expect(result.actualClosingCash).toBeNull();
      expect(result.difference).toBeNull();
      expect(result.status).toBe("not_counted");
    });

    it("uses the stored opening cash when a CashCount row exists", async () => {
      const { service } = makeService({
        cashCount: { openingCash: 500, actualClosingCash: null, countedBy: null, countedAt: null },
        cashSales: 1000,
      });
      const result = await service.computeCashFlow("store-1", new Date("2026-08-10"));
      expect(result.openingCash).toBe(500);
      expect(result.expectedClosingCash).toBe(1500);
    });

    it("reports a shortage when actual counted cash is below expected", async () => {
      const { service } = makeService({
        cashCount: { openingCash: 500, actualClosingCash: 1400, countedBy: null, countedAt: new Date() },
        cashSales: 2047,
        cashRefunds: 1067,
        cashExpenses: 0,
      });
      // Expected = 500 + 2047 - 1067 - 0 = 1480; actual = 1400 -> -80
      const result = await service.computeCashFlow("store-1", new Date("2026-08-10"));
      expect(result.expectedClosingCash).toBe(1480);
      expect(result.difference).toBe(-80);
      expect(result.status).toBe("shortage");
    });

    it("reports a surplus when actual counted cash is above expected", async () => {
      const { service } = makeService({
        cashCount: { openingCash: 0, actualClosingCash: 600, countedBy: null, countedAt: new Date() },
        cashSales: 500,
      });
      const result = await service.computeCashFlow("store-1", new Date("2026-08-10"));
      expect(result.expectedClosingCash).toBe(500);
      expect(result.difference).toBe(100);
      expect(result.status).toBe("surplus");
    });

    it("reports balanced when actual matches expected exactly", async () => {
      const { service } = makeService({
        cashCount: { openingCash: 100, actualClosingCash: 600, countedBy: null, countedAt: new Date() },
        cashSales: 500,
      });
      const result = await service.computeCashFlow("store-1", new Date("2026-08-10"));
      expect(result.difference).toBe(0);
      expect(result.status).toBe("balanced");
    });

    it("surfaces pending cash-method expenses separately, without touching the expected total", async () => {
      const { service } = makeService({
        cashSales: 1000,
        pending: { count: 2, amount: 150 },
      });
      const result = await service.computeCashFlow("store-1", new Date("2026-08-10"));
      expect(result.expectedClosingCash).toBe(1000);
      expect(result.pendingCashImpact).toEqual({ count: 2, amount: 150 });
    });
  });
});
