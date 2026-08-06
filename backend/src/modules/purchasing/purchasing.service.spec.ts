import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PurchasingService } from "./purchasing.service";

function buildDeps() {
  const prisma = {
    store: { findUnique: jest.fn() },
    purchaseOrder: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const inventory = { postStockMovement: jest.fn() };
  return { prisma, audit, inventory };
}

describe("PurchasingService", () => {
  describe("createPurchaseOrder — mirrors Inventory Plan's cost/profit formulas (FR-PUR-1/2)", () => {
    it("computes line totals and expected profit, auto-approving orders under the threshold", async () => {
      const { prisma, audit, inventory } = buildDeps();
      prisma.store.findUnique.mockResolvedValue({ id: "store-1", poApprovalThreshold: 5000 });
      prisma.purchaseOrder.create.mockImplementation(({ data }: any) => ({
        id: "po-1",
        status: data.status,
        lines: data.lines.create,
      }));

      const service = new PurchasingService(prisma as any, audit as any, inventory as any);
      const result = await service.createPurchaseOrder(
        {
          storeId: "store-1",
          supplierId: "sup-1",
          lines: [{ variantId: "v1", quantityOrdered: 10, costPrice: 250, sellingPriceAtOrder: 420 }],
        } as any,
        "user-1",
      );

      expect(result.status).toBe("approved");
      expect(result.lines[0].lineTotal).toBe(2500);
      expect(result.lines[0].expectedProfit).toBe(1700);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "create" }));
    });

    it("requires approval when the order total exceeds the store's threshold (FR-PUR-4)", async () => {
      const { prisma, audit, inventory } = buildDeps();
      prisma.store.findUnique.mockResolvedValue({ id: "store-1", poApprovalThreshold: 1000 });
      prisma.purchaseOrder.create.mockImplementation(({ data }: any) => ({
        id: "po-2",
        status: data.status,
        lines: data.lines.create,
      }));

      const service = new PurchasingService(prisma as any, audit as any, inventory as any);
      const result = await service.createPurchaseOrder(
        {
          storeId: "store-1",
          supplierId: "sup-1",
          lines: [{ variantId: "v1", quantityOrdered: 10, costPrice: 250, sellingPriceAtOrder: 420 }],
        } as any,
        "user-1",
      );

      expect(result.status).toBe("pending_approval");
    });

    it("throws when the store does not exist", async () => {
      const { prisma, audit, inventory } = buildDeps();
      prisma.store.findUnique.mockResolvedValue(null);
      const service = new PurchasingService(prisma as any, audit as any, inventory as any);

      await expect(
        service.createPurchaseOrder(
          {
            storeId: "missing",
            supplierId: "sup-1",
            lines: [{ variantId: "v1", quantityOrdered: 1, costPrice: 1, sellingPriceAtOrder: 2 }],
          } as any,
          "user-1",
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("approve — PO approval workflow (FR-PUR-4)", () => {
    it("rejects approving a PO that is not pending_approval", async () => {
      const { prisma, audit, inventory } = buildDeps();
      const service = new PurchasingService(prisma as any, audit as any, inventory as any);
      jest.spyOn(service, "findOne").mockResolvedValue({ id: "po-1", status: "draft" } as any);

      await expect(service.approve("po-1", "user-1")).rejects.toThrow(BadRequestException);
      expect(prisma.purchaseOrder.update).not.toHaveBeenCalled();
    });

    it("approves a pending_approval PO and writes an audit record", async () => {
      const { prisma, audit, inventory } = buildDeps();
      const service = new PurchasingService(prisma as any, audit as any, inventory as any);
      jest
        .spyOn(service, "findOne")
        .mockResolvedValue({ id: "po-1", status: "pending_approval" } as any);
      prisma.purchaseOrder.update.mockResolvedValue({ id: "po-1", status: "approved" });

      const result = await service.approve("po-1", "manager-1");

      expect(result.status).toBe("approved");
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "approve" }));
    });
  });
});
