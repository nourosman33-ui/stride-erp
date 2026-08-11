import { ConflictException, NotFoundException } from "@nestjs/common";
import { SessionsService } from "./sessions.service";

function buildPrisma() {
  const businessSession = {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn((args: any) => ({ id: "sess-new", ...args.data })),
    update: jest.fn((args: any) => ({ id: args.where.id, ...args.data })),
  };
  const store = { update: jest.fn().mockResolvedValue({ sessionSeq: 1 }) };
  const prisma: any = {
    businessSession,
    store,
    salesOrder: { findMany: jest.fn().mockResolvedValue([]) },
    salesReturn: { findMany: jest.fn().mockResolvedValue([]) },
    dailyExpense: { findMany: jest.fn().mockResolvedValue([]) },
    payment: { groupBy: jest.fn().mockResolvedValue([]) },
    salesOrderLine: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: null } }) },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

function makeService() {
  const prisma = buildPrisma();
  return { service: new SessionsService(prisma as any), prisma };
}

describe("SessionsService", () => {
  describe("start", () => {
    it("opens a session with the next per-store number and records who opened it", async () => {
      const { service, prisma } = makeService();
      prisma.store.update.mockResolvedValue({ sessionSeq: 7 });

      const session = await service.start("store-1", "user-1", 500);

      expect(session.sessionNumber).toBe(7);
      expect(session.status).toBe("active");
      expect(session.startedById).toBe("user-1");
      expect(session.openingCash).toBe(500);
    });

    it("refuses to open a second session while one is still active", async () => {
      const { service, prisma } = makeService();
      prisma.businessSession.findFirst.mockResolvedValue({ id: "sess-1", sessionNumber: 3 });

      await expect(service.start("store-1", "user-1")).rejects.toThrow(ConflictException);
      expect(prisma.businessSession.create).not.toHaveBeenCalled();
    });

    it("allows a null opening float — a session is about trading, not the drawer", async () => {
      const { service } = makeService();
      const session = await service.start("store-1", "user-1");
      expect(session.openingCash).toBeNull();
    });
  });

  describe("end", () => {
    it("closes the session and stamps who ended it and when", async () => {
      const { service, prisma } = makeService();
      prisma.businessSession.findUnique.mockResolvedValue({ id: "sess-1", status: "active" });

      const closed = await service.end("sess-1", "user-2", 900);

      expect(closed.status).toBe("closed");
      expect(closed.endedById).toBe("user-2");
      expect(closed.endedAt).toBeInstanceOf(Date);
      expect(closed.closingCash).toBe(900);
    });

    it("refuses to close a session that is already closed", async () => {
      const { service, prisma } = makeService();
      prisma.businessSession.findUnique.mockResolvedValue({ id: "sess-1", status: "closed" });
      await expect(service.end("sess-1", "user-2")).rejects.toThrow(ConflictException);
    });

    it("404s an unknown session", async () => {
      const { service, prisma } = makeService();
      prisma.businessSession.findUnique.mockResolvedValue(null);
      await expect(service.end("nope", "user-2")).rejects.toThrow(NotFoundException);
    });
  });

  describe("activeSessionId", () => {
    it("returns null when nothing is open, so trading is never blocked", async () => {
      const { service } = makeService();
      await expect(service.activeSessionId("store-1")).resolves.toBeNull();
    });

    it("returns the open session's id for stamping onto new transactions", async () => {
      const { service, prisma } = makeService();
      prisma.businessSession.findFirst.mockResolvedValue({ id: "sess-9" });
      await expect(service.activeSessionId("store-1")).resolves.toBe("sess-9");
    });
  });

  describe("computeSummary — scoped by session id, never by date", () => {
    it("queries every source on sessionId alone, with no date window", async () => {
      const { service, prisma } = makeService();
      await service.computeSummary("sess-1");

      // The whole point of the feature: a session's figures must not depend on
      // the calendar, or two sessions on one date would contaminate each other.
      const wheres = [
        prisma.salesOrder.findMany.mock.calls[0][0].where,
        prisma.salesReturn.findMany.mock.calls[0][0].where,
        prisma.dailyExpense.findMany.mock.calls[0][0].where,
      ];
      for (const where of wheres) {
        expect(where.sessionId).toBe("sess-1");
        expect(JSON.stringify(where)).not.toMatch(/orderDate|returnDate|occurredAt/);
      }
    });

    it("returns zeroes for a session with no activity", async () => {
      const { service } = makeService();
      const summary = await service.computeSummary("sess-empty");
      expect(summary).toMatchObject({
        totalSales: 0,
        salesCount: 0,
        totalRefunds: 0,
        totalExpenses: 0,
        netSales: 0,
        netCash: 0,
        transactionCount: 0,
      });
    });

    it("computes net sales as sales less refunds, and counts every transaction type", async () => {
      const { service, prisma } = makeService();
      prisma.salesOrder.findMany.mockResolvedValue([
        { id: "o1", grandTotal: 1000, cashierId: "u1", cashier: { id: "u1", fullName: "Cashier" }, exchangedFrom: null },
        { id: "o2", grandTotal: 500, cashierId: "u1", cashier: { id: "u1", fullName: "Cashier" }, exchangedFrom: null },
      ]);
      prisma.salesReturn.findMany.mockResolvedValue([
        { id: "r1", type: "refund", refundTotal: 200, exchangeTotal: 0, refundMethod: "cash" },
        { id: "r2", type: "exchange", refundTotal: 100, exchangeTotal: 300, refundMethod: null },
      ]);
      prisma.dailyExpense.findMany.mockResolvedValue([
        { id: "e1", amount: 50, paymentMethod: "cash" },
      ]);
      prisma.payment.groupBy.mockResolvedValue([{ method: "cash", _sum: { amount: 1500 } }]);

      const s = await service.computeSummary("sess-1");

      expect(s.totalSales).toBe(1500);
      expect(s.salesCount).toBe(2);
      expect(s.totalRefunds).toBe(300); // 200 + 100
      expect(s.refundsCount).toBe(1);
      expect(s.exchangesCount).toBe(1);
      expect(s.totalExchanges).toBe(300);
      expect(s.totalExpenses).toBe(50);
      expect(s.netSales).toBe(1200); // 1500 − 300
      // Cash in the drawer: 1500 cash sales − 200 cash refund − 50 cash expense.
      expect(s.netCash).toBe(1250);
      expect(s.transactionCount).toBe(5); // 2 sales + 2 returns + 1 expense
    });

    it("attributes sales to each cashier for shift review", async () => {
      const { service, prisma } = makeService();
      prisma.salesOrder.findMany.mockResolvedValue([
        { id: "o1", grandTotal: 100, cashierId: "u1", cashier: { id: "u1", fullName: "Ann" }, exchangedFrom: null },
        { id: "o2", grandTotal: 300, cashierId: "u2", cashier: { id: "u2", fullName: "Bob" }, exchangedFrom: null },
        { id: "o3", grandTotal: 50, cashierId: "u1", cashier: { id: "u1", fullName: "Ann" }, exchangedFrom: null },
      ]);

      const s = await service.computeSummary("sess-1");

      expect(s.cashierActivity).toEqual([
        { userId: "u2", fullName: "Bob", salesCount: 1, salesTotal: 300 },
        { userId: "u1", fullName: "Ann", salesCount: 2, salesTotal: 150 },
      ]);
    });
  });
});
