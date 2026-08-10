import { OperatingExpense } from "@prisma/client";
import { FinanceService } from "./finance.service";
import { DAYS_PER_MONTH } from "./finance.constants";

function buildDeps() {
  const prisma = {
    store: { findUnique: jest.fn() },
    salesOrder: { aggregate: jest.fn() },
    salesOrderLine: { findMany: jest.fn() },
    stockLedgerEntry: { findMany: jest.fn() },
    operatingExpense: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    salesReturn: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { refundSubtotal: null, refundTaxTotal: null, refundTotal: null },
        _count: 0,
      }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    salesReturnLine: { findMany: jest.fn().mockResolvedValue([]) },
    payment: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  const inventory = { getTotalInventoryValue: jest.fn().mockResolvedValue(0) };
  return { prisma, inventory };
}

function makeService() {
  const { prisma, inventory } = buildDeps();
  const service = new FinanceService(prisma as any, inventory as any);
  return { service, prisma, inventory };
}

/** Minimal OperatingExpense row — only the fields the maths reads. */
function expense(over: Partial<OperatingExpense> = {}): OperatingExpense {
  return {
    id: "exp-1",
    storeId: "store-1",
    category: "rent",
    label: "Shop rent",
    amount: 2000 as never,
    frequency: "monthly",
    startDate: new Date("2026-01-01"),
    endDate: null,
    isActive: true,
    notes: null,
    createdById: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...over,
  } as OperatingExpense;
}

describe("FinanceService", () => {
  describe("expenseChargeForWindow — frequency normalisation", () => {
    it("pro-rates a monthly cost across an exact calendar month using average month length", () => {
      const { service } = makeService();
      // 2,000/month over 31 days at 2000/30.4375 per day.
      const charge = service.expenseChargeForWindow(
        expense({ amount: 2000 as never, frequency: "monthly" }),
        new Date("2026-03-01"),
        new Date("2026-04-01"),
      );
      expect(charge).toBeCloseTo((2000 / DAYS_PER_MONTH) * 31, 2);
    });

    it("charges a shorter month less than a longer one", () => {
      const { service } = makeService();
      const feb = service.expenseChargeForWindow(
        expense(),
        new Date("2026-02-01"),
        new Date("2026-03-01"),
      );
      const mar = service.expenseChargeForWindow(
        expense(),
        new Date("2026-03-01"),
        new Date("2026-04-01"),
      );
      expect(feb).toBeLessThan(mar);
    });

    it("pro-rates only the overlap when the cost starts mid-window", () => {
      const { service } = makeService();
      const charge = service.expenseChargeForWindow(
        expense({ frequency: "daily", amount: 100 as never, startDate: new Date("2026-03-11") }),
        new Date("2026-03-01"),
        new Date("2026-03-21"),
      );
      expect(charge).toBe(1000); // 10 days x 100
    });

    it("stops charging after the cost is closed", () => {
      const { service } = makeService();
      const charge = service.expenseChargeForWindow(
        expense({
          frequency: "daily",
          amount: 100 as never,
          startDate: new Date("2026-03-01"),
          endDate: new Date("2026-03-06"),
        }),
        new Date("2026-03-01"),
        new Date("2026-03-21"),
      );
      expect(charge).toBe(500); // 5 days only
    });

    it("charges a one-off in full to the window containing it, and zero elsewhere", () => {
      const { service } = makeService();
      const e = expense({
        frequency: "one_time",
        amount: 5000 as never,
        startDate: new Date("2026-03-10"),
      });
      expect(
        service.expenseChargeForWindow(e, new Date("2026-03-01"), new Date("2026-04-01")),
      ).toBe(5000);
      expect(
        service.expenseChargeForWindow(e, new Date("2026-04-01"), new Date("2026-05-01")),
      ).toBe(0);
    });

    it("returns zero when the window sits entirely before the cost starts", () => {
      const { service } = makeService();
      const charge = service.expenseChargeForWindow(
        expense({ startDate: new Date("2026-06-01") }),
        new Date("2026-01-01"),
        new Date("2026-02-01"),
      );
      expect(charge).toBe(0);
    });
  });

  describe("monthlyRunRate", () => {
    it("sums the seeded cost base to 5,000/month", () => {
      const { service } = makeService();
      const rate = service.monthlyRunRate([
        expense({ id: "a", amount: 2000 as never, frequency: "monthly" }),
        expense({ id: "b", category: "utilities", amount: 3000 as never, frequency: "monthly" }),
      ]);
      expect(rate).toBeCloseTo(5000, 1);
    });

    it("normalises mixed frequencies onto a monthly basis", () => {
      const { service } = makeService();
      const rate = service.monthlyRunRate([
        expense({ id: "a", amount: 700 as never, frequency: "weekly" }),
        expense({ id: "b", amount: 12000 as never, frequency: "yearly" }),
      ]);
      // 700/7 = 100/day, 12000/365.25 ≈ 32.85/day → (132.85 * 30.4375)
      expect(rate).toBeCloseTo((700 / 7 + 12000 / 365.25) * DAYS_PER_MONTH, 1);
    });

    it("excludes one-off and inactive costs from the recurring run-rate", () => {
      const { service } = makeService();
      const rate = service.monthlyRunRate([
        expense({ id: "a", amount: 2000 as never, frequency: "monthly" }),
        expense({ id: "b", amount: 50000 as never, frequency: "one_time" }),
        expense({ id: "c", amount: 9000 as never, frequency: "monthly", isActive: false }),
      ]);
      expect(rate).toBeCloseTo(2000, 1);
    });
  });

  describe("getPnl — margin integrity", () => {
    const from = new Date("2026-03-01");
    const to = new Date("2026-04-01");

    function primeSale(prisma: ReturnType<typeof buildDeps>["prisma"]) {
      // One order: subtotal 1000, discount 100, VAT 126, grand total 1026.
      prisma.salesOrder.aggregate.mockResolvedValue({
        _sum: { subtotal: 1000, discountTotal: 100, taxTotal: 126, grandTotal: 1026 },
        _count: 1,
      });
      prisma.salesOrderLine.findMany.mockResolvedValue([{ variantId: "v1", quantity: 2 }]);
      // Two units received at 250 each → weighted average cost 250.
      prisma.stockLedgerEntry.findMany.mockResolvedValue([
        { variantId: "v1", quantityDelta: 2, unitCost: 250 },
      ]);
    }

    it("excludes VAT from revenue so gross margin is not overstated", async () => {
      const { service, prisma } = makeService();
      primeSale(prisma);
      prisma.operatingExpense.findMany.mockResolvedValue([]);

      const pnl = await service.getPnl("store-1", from, to);

      expect(pnl.grossRevenue).toBe(1026); // VAT-inclusive, reported for reference
      expect(pnl.vatCollected).toBe(126);
      expect(pnl.netRevenue).toBe(900); // 1000 − 100, VAT excluded
      expect(pnl.cogs).toBe(500); // 2 x 250
      expect(pnl.grossProfit).toBe(400);
      expect(pnl.grossMarginPct).toBeCloseTo(44.44, 1); // 400/900, NOT 400/1026
    });

    it("subtracts operating expenses to reach net profit", async () => {
      const { service, prisma } = makeService();
      primeSale(prisma);
      prisma.operatingExpense.findMany.mockResolvedValue([
        expense({ frequency: "daily", amount: 10 as never, startDate: new Date("2026-03-01") }),
      ]);

      const pnl = await service.getPnl("store-1", from, to);

      expect(pnl.operatingExpenses).toBe(310); // 31 days x 10
      expect(pnl.netProfit).toBe(90); // 400 gross − 310 opex
      expect(pnl.netMarginPct).toBeCloseTo(10, 1); // 90/900
    });

    it("reports a loss rather than clamping when costs exceed gross profit", async () => {
      const { service, prisma } = makeService();
      primeSale(prisma);
      prisma.operatingExpense.findMany.mockResolvedValue([
        expense({ frequency: "daily", amount: 100 as never, startDate: new Date("2026-03-01") }),
      ]);

      const pnl = await service.getPnl("store-1", from, to);

      expect(pnl.operatingExpenses).toBe(3100);
      expect(pnl.netProfit).toBe(-2700);
      expect(pnl.netMarginPct).toBeLessThan(0);
    });

    it("returns null margins instead of NaN when there is no revenue", async () => {
      const { service, prisma } = makeService();
      prisma.salesOrder.aggregate.mockResolvedValue({
        _sum: { subtotal: null, discountTotal: null, taxTotal: null, grandTotal: null },
        _count: 0,
      });
      prisma.salesOrderLine.findMany.mockResolvedValue([]);
      prisma.stockLedgerEntry.findMany.mockResolvedValue([]);
      prisma.operatingExpense.findMany.mockResolvedValue([]);

      const pnl = await service.getPnl("store-1", from, to);

      expect(pnl.netRevenue).toBe(0);
      expect(pnl.grossMarginPct).toBeNull();
      expect(pnl.netMarginPct).toBeNull();
      expect(pnl.averageBasket).toBeNull();
    });

    it("subtracts a restocked return from revenue AND reverses its cost", async () => {
      const { service, prisma } = makeService();
      primeSale(prisma);
      prisma.operatingExpense.findMany.mockResolvedValue([]);
      // One of the two units came back and went straight back on the shelf.
      prisma.salesReturn.aggregate.mockResolvedValue({
        _sum: { refundSubtotal: 450, refundTaxTotal: 63, refundTotal: 513 },
        _count: 1,
      });
      prisma.salesReturnLine.findMany.mockResolvedValue([
        { variantId: "v1", quantity: 1, restock: true },
      ]);

      const pnl = await service.getPnl("store-1", from, to);

      expect(pnl.grossSalesNet).toBe(900); // sales before returns
      expect(pnl.returnsNetValue).toBe(450);
      expect(pnl.netRevenue).toBe(450); // 900 − 450
      expect(pnl.cogs).toBe(250); // 2 sold − 1 restocked = 1 unit @ 250
      expect(pnl.grossProfit).toBe(200);
      expect(pnl.unitsSold).toBe(1);
      expect(pnl.returnCount).toBe(1);
    });

    it("keeps the cost of a damaged (non-restocked) return in COGS as a real loss", async () => {
      const { service, prisma } = makeService();
      primeSale(prisma);
      prisma.operatingExpense.findMany.mockResolvedValue([]);
      prisma.salesReturn.aggregate.mockResolvedValue({
        _sum: { refundSubtotal: 450, refundTaxTotal: 63, refundTotal: 513 },
        _count: 1,
      });
      prisma.salesReturnLine.findMany.mockResolvedValue([
        { variantId: "v1", quantity: 1, restock: false },
      ]);

      const pnl = await service.getPnl("store-1", from, to);

      expect(pnl.netRevenue).toBe(450); // customer still refunded
      expect(pnl.cogs).toBe(500); // both units' cost stays — the goods are gone
      expect(pnl.grossProfit).toBe(-50); // refunding a write-off is a loss, and it shows
    });

    it("nets VAT down by the tax refunded, so the liability is not overstated", async () => {
      const { service, prisma } = makeService();
      primeSale(prisma);
      prisma.operatingExpense.findMany.mockResolvedValue([]);
      prisma.salesReturn.aggregate.mockResolvedValue({
        _sum: { refundSubtotal: 450, refundTaxTotal: 63, refundTotal: 513 },
        _count: 1,
      });
      prisma.salesReturnLine.findMany.mockResolvedValue([
        { variantId: "v1", quantity: 1, restock: true },
      ]);

      const pnl = await service.getPnl("store-1", from, to);

      expect(pnl.vatCollected).toBe(63); // 126 charged − 63 given back
      expect(pnl.grossRevenue).toBe(513); // 1026 − 513
    });

    it("uses weighted-average cost across receipts at different prices", async () => {
      const { service, prisma } = makeService();
      prisma.salesOrder.aggregate.mockResolvedValue({
        _sum: { subtotal: 1000, discountTotal: 0, taxTotal: 140, grandTotal: 1140 },
        _count: 1,
      });
      prisma.salesOrderLine.findMany.mockResolvedValue([{ variantId: "v1", quantity: 1 }]);
      // 10 @ 200 and 10 @ 300 → weighted average 250, not 200 or 300.
      prisma.stockLedgerEntry.findMany.mockResolvedValue([
        { variantId: "v1", quantityDelta: 10, unitCost: 200 },
        { variantId: "v1", quantityDelta: 10, unitCost: 300 },
      ]);
      prisma.operatingExpense.findMany.mockResolvedValue([]);

      const pnl = await service.getPnl("store-1", from, to);
      expect(pnl.cogs).toBe(250);
    });
  });

  // The daily-expenses module's only two touchpoints into this file (see the
  // "daily-expenses module glue" section of finance.service.ts) — regression
  // guards confirming they don't reach into or alter any of the P&L/forecast
  // math exercised by every test above.
  describe("getOperatingExpensesTotal — daily-expenses module glue", () => {
    it("pro-rates active recurring costs over the window, same as getPnl's opex line", async () => {
      const { service, prisma } = makeService();
      prisma.operatingExpense.findMany.mockResolvedValue([expense({ amount: 3000 as never, frequency: "monthly" })]);
      const total = await service.getOperatingExpensesTotal(
        "store-1",
        new Date("2026-03-01"),
        new Date("2026-04-01"),
      );
      expect(total).toBeCloseTo((3000 / DAYS_PER_MONTH) * 31, 2);
    });

    it("returns 0 when there are no active costs", async () => {
      const { service, prisma } = makeService();
      prisma.operatingExpense.findMany.mockResolvedValue([]);
      const total = await service.getOperatingExpensesTotal(
        "store-1",
        new Date("2026-03-01"),
        new Date("2026-04-01"),
      );
      expect(total).toBe(0);
    });
  });

  describe("getPaymentMethodBreakdown / getRefundsByMethod — daily-expenses module glue", () => {
    const from = new Date("2026-03-01");
    const to = new Date("2026-04-01");

    it("maps grouped payment sums onto every method, defaulting absent methods to 0", async () => {
      const { service, prisma } = makeService();
      prisma.payment.groupBy.mockResolvedValue([
        { method: "cash", _sum: { amount: 2047 } },
        { method: "card", _sum: { amount: 500 } },
      ]);
      const result = await service.getPaymentMethodBreakdown("store-1", from, to);
      expect(result).toEqual({ cash: 2047, card: 500, mobile_wallet: 0, bank_transfer: 0 });
    });

    it("excludes voided orders via the same REVENUE_STATUS_FILTER getPnl uses", async () => {
      const { service, prisma } = makeService();
      prisma.payment.groupBy.mockResolvedValue([]);
      await service.getPaymentMethodBreakdown("store-1", from, to);
      const whereArg = prisma.payment.groupBy.mock.calls[0][0].where;
      expect(whereArg.order.status).toEqual({ not: "voided" });
    });

    it("maps grouped refund sums onto every method, ignoring exchanges with no refundMethod", async () => {
      const { service, prisma } = makeService();
      prisma.salesReturn.groupBy.mockResolvedValue([{ refundMethod: "cash", _sum: { refundTotal: 1067 } }]);
      const result = await service.getRefundsByMethod("store-1", from, to);
      expect(result).toEqual({ cash: 1067, card: 0, mobile_wallet: 0, bank_transfer: 0 });
    });
  });
});
