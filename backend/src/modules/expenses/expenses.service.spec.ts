import { ConflictException, NotFoundException } from "@nestjs/common";
import { ExpensesService } from "./expenses.service";
import type { AuthenticatedUser } from "../../common/decorators/current-user.decorator";

function buildPrisma() {
  return {
    dailyExpense: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _count: 0, _sum: { amount: null } }),
      create: jest.fn((args: any) => ({ id: "exp-new", ...args.data })),
      update: jest.fn((args: any) => ({ id: args.where.id, ...args.data })),
    },
    auditLog: { findMany: jest.fn() },
  };
}

function makeService(activeSessionId: string | null = null) {
  const prisma = buildPrisma();
  const sessions = { activeSessionId: jest.fn().mockResolvedValue(activeSessionId) };
  const service = new ExpensesService(prisma as any, sessions as any);
  return { service, prisma, sessions };
}

const cashier: AuthenticatedUser = { userId: "user-cashier", email: "c@x.com", roles: ["cashier"] };
const manager: AuthenticatedUser = { userId: "user-manager", email: "m@x.com", roles: ["manager"] };
const owner: AuthenticatedUser = { userId: "user-owner", email: "o@x.com", roles: ["owner"] };

const baseDto = {
  storeId: "store-1",
  categoryId: "cat-1",
  description: "Water for the shop",
  amount: 50,
  paymentMethod: "cash" as const,
};

describe("ExpensesService", () => {
  describe("create — status resolution by role", () => {
    it("starts pending for a cashier-created expense, with no approver set", async () => {
      const { service } = makeService();
      const created = await service.create(baseDto, cashier);
      expect(created.status).toBe("pending");
      expect(created.approvedById).toBeUndefined();
    });

    it("auto-approves a manager-created expense, self-approved immediately", async () => {
      const { service } = makeService();
      const created = await service.create(baseDto, manager);
      expect(created.status).toBe("approved");
      expect(created.approvedById).toBe(manager.userId);
      expect(created.approvedAt).toBeInstanceOf(Date);
    });

    it("auto-approves an owner-created expense", async () => {
      const { service } = makeService();
      const created = await service.create(baseDto, owner);
      expect(created.status).toBe("approved");
      expect(created.approvedById).toBe(owner.userId);
    });

    it("stamps the active session so the expense belongs to that business day", async () => {
      const { service, prisma } = makeService("session-1");
      await service.create(baseDto, cashier);
      expect(prisma.dailyExpense.create.mock.calls[0][0].data.sessionId).toBe("session-1");
    });

    it("still records the expense when no session is open, unattributed rather than blocked", async () => {
      const { service, prisma } = makeService(null);
      const created = await service.create(baseDto, cashier);
      expect(created).toBeDefined();
      expect(prisma.dailyExpense.create.mock.calls[0][0].data.sessionId).toBeNull();
    });

    it("never trusts a client-supplied status — only role determines it", async () => {
      const { service } = makeService();
      // CreateDailyExpenseDto has no `status` field at all, so even if a caller
      // stuffed one onto the object, create() only ever reads dto.description etc.
      const created = await service.create({ ...baseDto, status: "approved" } as any, cashier);
      expect(created.status).toBe("pending");
    });
  });

  describe("approve / reject — state machine", () => {
    it("moves a pending expense to approved, recording who and when", async () => {
      const { service, prisma } = makeService();
      prisma.dailyExpense.findFirst.mockResolvedValue({ id: "exp-1", status: "pending", deletedAt: null });
      const result = await service.approve("exp-1", manager);
      expect(result.status).toBe("approved");
      expect(result.approvedById).toBe(manager.userId);
    });

    it("refuses to approve an already-approved expense", async () => {
      const { service, prisma } = makeService();
      prisma.dailyExpense.findFirst.mockResolvedValue({ id: "exp-1", status: "approved", deletedAt: null });
      await expect(service.approve("exp-1", manager)).rejects.toThrow(ConflictException);
    });

    it("refuses to approve a rejected expense", async () => {
      const { service, prisma } = makeService();
      prisma.dailyExpense.findFirst.mockResolvedValue({ id: "exp-1", status: "rejected", deletedAt: null });
      await expect(service.approve("exp-1", manager)).rejects.toThrow(ConflictException);
    });

    it("moves a pending expense to rejected, recording the reason", async () => {
      const { service, prisma } = makeService();
      prisma.dailyExpense.findFirst.mockResolvedValue({ id: "exp-1", status: "pending", deletedAt: null });
      const result = await service.reject("exp-1", "Duplicate entry", manager);
      expect(result.status).toBe("rejected");
      expect(result.rejectionReason).toBe("Duplicate entry");
      expect(result.rejectedById).toBe(manager.userId);
    });

    it("refuses to reject a non-pending expense", async () => {
      const { service, prisma } = makeService();
      prisma.dailyExpense.findFirst.mockResolvedValue({ id: "exp-1", status: "approved", deletedAt: null });
      await expect(service.reject("exp-1", "why", manager)).rejects.toThrow(ConflictException);
    });

    it("404s approving an expense that doesn't exist or is already deleted", async () => {
      const { service, prisma } = makeService();
      prisma.dailyExpense.findFirst.mockResolvedValue(null);
      await expect(service.approve("missing", manager)).rejects.toThrow(NotFoundException);
    });
  });

  describe("update — rejected expenses are frozen", () => {
    it("refuses to edit a rejected expense", async () => {
      const { service, prisma } = makeService();
      prisma.dailyExpense.findFirst.mockResolvedValue({ id: "exp-1", status: "rejected", deletedAt: null });
      await expect(service.update("exp-1", { description: "fixed" }, manager)).rejects.toThrow(ConflictException);
    });

    it("allows editing a pending or approved expense", async () => {
      const { service, prisma } = makeService();
      prisma.dailyExpense.findFirst.mockResolvedValue({ id: "exp-1", status: "approved", deletedAt: null });
      const result = await service.update("exp-1", { description: "corrected" }, manager);
      expect(result.description).toBe("corrected");
      expect(result.lastModifiedById).toBe(manager.userId);
    });
  });

  describe("softDelete — never a real delete", () => {
    it("sets deletedAt/deletedById/deletionReason instead of removing the row", async () => {
      const { service, prisma } = makeService();
      prisma.dailyExpense.findFirst.mockResolvedValue({ id: "exp-1", status: "approved", deletedAt: null });
      const result = await service.softDelete("exp-1", "Entered by mistake", owner);
      expect(result.deletedAt).toBeInstanceOf(Date);
      expect(result.deletedById).toBe(owner.userId);
      expect(result.deletionReason).toBe("Entered by mistake");
      // The update call must never be a `delete` — confirmed by prisma.dailyExpense.delete
      // simply not existing on the mock, so calling it would have thrown TypeError.
    });
  });

  describe("findOne — cashier row-scoping (own + today only)", () => {
    it("lets a cashier see their own expense from today", async () => {
      const { service, prisma } = makeService();
      const now = new Date();
      prisma.dailyExpense.findFirst.mockResolvedValue({
        id: "exp-1",
        createdById: cashier.userId,
        occurredAt: now,
        deletedAt: null,
      });
      await expect(service.findOne("exp-1", cashier)).resolves.toMatchObject({ id: "exp-1" });
    });

    it("404s a cashier looking at someone else's expense from today (not 403 — doesn't confirm existence)", async () => {
      const { service, prisma } = makeService();
      prisma.dailyExpense.findFirst.mockResolvedValue({
        id: "exp-1",
        createdById: "someone-else",
        occurredAt: new Date(),
        deletedAt: null,
      });
      await expect(service.findOne("exp-1", cashier)).rejects.toThrow(NotFoundException);
    });

    it("404s a cashier looking at their own expense from a previous day", async () => {
      const { service, prisma } = makeService();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      prisma.dailyExpense.findFirst.mockResolvedValue({
        id: "exp-1",
        createdById: cashier.userId,
        occurredAt: yesterday,
        deletedAt: null,
      });
      await expect(service.findOne("exp-1", cashier)).rejects.toThrow(NotFoundException);
    });

    it("lets a manager see any expense regardless of who created it or when", async () => {
      const { service, prisma } = makeService();
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      prisma.dailyExpense.findFirst.mockResolvedValue({
        id: "exp-1",
        createdById: "someone-else",
        occurredAt: lastWeek,
        deletedAt: null,
      });
      await expect(service.findOne("exp-1", manager)).resolves.toMatchObject({ id: "exp-1" });
    });
  });

  describe("list — cashier scoping overrides any client-supplied filter", () => {
    it("forces createdById to the cashier's own id even if a different userId filter is sent", async () => {
      const { service, prisma } = makeService();
      prisma.dailyExpense.findMany.mockResolvedValue([]);
      await service.list({ storeId: "store-1", userId: "someone-else" } as any, cashier);
      const whereArg = prisma.dailyExpense.findMany.mock.calls[0][0].where;
      expect(whereArg.createdById).toBe(cashier.userId);
    });

    it("respects an explicit userId filter for an elevated requester", async () => {
      const { service, prisma } = makeService();
      prisma.dailyExpense.findMany.mockResolvedValue([]);
      await service.list({ storeId: "store-1", userId: "some-cashier" } as any, manager);
      const whereArg = prisma.dailyExpense.findMany.mock.calls[0][0].where;
      expect(whereArg.createdById).toBe("some-cashier");
    });
  });
});
