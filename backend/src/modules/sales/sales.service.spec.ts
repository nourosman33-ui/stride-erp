import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SalesService } from "./sales.service";

function buildDeps() {
  const tx = {
    store: { update: jest.fn() },
    salesOrder: { create: jest.fn() },
    customer: { create: jest.fn() },
    loyaltyTransaction: { aggregate: jest.fn(), create: jest.fn() },
  };
  const prisma = {
    store: { findUnique: jest.fn() },
    customer: { findUnique: jest.fn() },
    productVariant: { findMany: jest.fn() },
    salesOrder: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  };
  const audit = { record: jest.fn() };
  const inventory = {
    getStockOnHand: jest.fn(),
    postStockMovement: jest.fn(),
    listQuantitiesOnHand: jest.fn(),
  };
  const customers = {
    getPointsBalance: jest.fn().mockResolvedValue(0),
    computeStats: jest.fn().mockResolvedValue({ totalOrders: 0, lifetimeSpending: 0, lastPurchaseAt: null }),
    computeTier: jest.fn().mockResolvedValue("bronze"),
  };
  return { prisma, audit, inventory, customers, tx };
}

const VARIANT = {
  id: "variant-1",
  isActive: true,
  sellingPriceOverride: null,
  product: { modelName: "Runner 300", baseSellingPrice: 500 },
};

const STORE = { id: "store-1", vatRate: 14, loyaltyPointValue: 1, loyaltyPointsPerCurrency: 0.1 };

describe("SalesService", () => {
  describe("checkout — FR-SAL-1/2/3 + FR-INV-2", () => {
    it("computes totals, deducts stock through InventoryService, and records a completed order", async () => {
      const { prisma, audit, inventory, customers, tx } = buildDeps();
      prisma.store.findUnique.mockResolvedValue(STORE);
      prisma.productVariant.findMany.mockResolvedValue([VARIANT]);
      inventory.getStockOnHand.mockResolvedValue(10);
      tx.store.update.mockResolvedValue({ invoiceSeq: 1 });
      tx.salesOrder.create.mockImplementation(({ data }: any) => ({
        id: "order-1",
        invoiceNumber: data.invoiceNumber,
        customerId: data.customerId,
        lines: data.lines.create.map((l: any, i: number) => ({ id: `line-${i}`, ...l })),
        payments: data.payments.create,
      }));

      const service = new SalesService(prisma as any, audit as any, inventory as any, customers as any);
      const result = await service.checkout(
        {
          storeId: "store-1",
          lines: [{ variantId: "variant-1", quantity: 2 }],
          payments: [{ method: "cash", amount: 1140 }],
        } as any,
        "cashier-1",
      );

      expect(result.id).toBe("order-1");
      expect(tx.salesOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotal: 1000,
            discountTotal: 0,
            taxTotal: 140,
            grandTotal: 1140,
            pointsEarned: 0,
            pointsRedeemed: 0,
            changeDue: 0,
            status: "completed",
          }),
        }),
      );
      expect(inventory.postStockMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: "store-1",
          variantId: "variant-1",
          entryType: "sale",
          quantityDelta: -2,
          referenceType: "sales_order",
          referenceId: "order-1",
        }),
        tx,
      );
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "create" }));
    });

    it("throws when the store does not exist", async () => {
      const { prisma, audit, inventory, customers } = buildDeps();
      prisma.store.findUnique.mockResolvedValue(null);
      const service = new SalesService(prisma as any, audit as any, inventory as any, customers as any);

      await expect(
        service.checkout(
          { storeId: "missing", lines: [{ variantId: "v1", quantity: 1 }], payments: [{ method: "cash", amount: 1 }] } as any,
          "cashier-1",
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a line whose variant is missing or inactive", async () => {
      const { prisma, audit, inventory, customers } = buildDeps();
      prisma.store.findUnique.mockResolvedValue(STORE);
      prisma.productVariant.findMany.mockResolvedValue([{ ...VARIANT, isActive: false }]);
      const service = new SalesService(prisma as any, audit as any, inventory as any, customers as any);

      await expect(
        service.checkout(
          {
            storeId: "store-1",
            lines: [{ variantId: "variant-1", quantity: 1 }],
            payments: [{ method: "cash", amount: 570 }],
          } as any,
          "cashier-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when the payment total does not match the invoice grand total (FR-SAL-3)", async () => {
      const { prisma, audit, inventory, customers } = buildDeps();
      prisma.store.findUnique.mockResolvedValue(STORE);
      prisma.productVariant.findMany.mockResolvedValue([VARIANT]);
      const service = new SalesService(prisma as any, audit as any, inventory as any, customers as any);

      await expect(
        service.checkout(
          {
            storeId: "store-1",
            lines: [{ variantId: "variant-1", quantity: 1 }],
            payments: [{ method: "cash", amount: 100 }],
          } as any,
          "cashier-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a checkout that would oversell stock (FR-INV-1/NFR-1), re-checked inside the transaction", async () => {
      const { prisma, audit, inventory, customers, tx } = buildDeps();
      prisma.store.findUnique.mockResolvedValue(STORE);
      prisma.productVariant.findMany.mockResolvedValue([VARIANT]);
      inventory.getStockOnHand.mockResolvedValue(1);
      const service = new SalesService(prisma as any, audit as any, inventory as any, customers as any);

      await expect(
        service.checkout(
          {
            storeId: "store-1",
            lines: [{ variantId: "variant-1", quantity: 5 }],
            payments: [{ method: "cash", amount: 2850 }],
          } as any,
          "cashier-1",
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tx.salesOrder.create).not.toHaveBeenCalled();
    });

    it("rejects a per-line discount larger than the unit price", async () => {
      const { prisma, audit, inventory, customers } = buildDeps();
      prisma.store.findUnique.mockResolvedValue(STORE);
      prisma.productVariant.findMany.mockResolvedValue([VARIANT]);
      const service = new SalesService(prisma as any, audit as any, inventory as any, customers as any);

      await expect(
        service.checkout(
          {
            storeId: "store-1",
            lines: [{ variantId: "variant-1", quantity: 1, discountAmount: 600 }],
            payments: [{ method: "cash", amount: 1 }],
          } as any,
          "cashier-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects redeeming points without an attached customer", async () => {
      const { prisma, audit, inventory, customers } = buildDeps();
      prisma.store.findUnique.mockResolvedValue(STORE);
      prisma.productVariant.findMany.mockResolvedValue([VARIANT]);
      const service = new SalesService(prisma as any, audit as any, inventory as any, customers as any);

      await expect(
        service.checkout(
          {
            storeId: "store-1",
            lines: [{ variantId: "variant-1", quantity: 1 }],
            payments: [{ method: "cash", amount: 570 }],
            redeemPoints: 50,
          } as any,
          "cashier-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects redemption beyond the customer's points balance (checked inside the transaction)", async () => {
      const { prisma, audit, inventory, customers, tx } = buildDeps();
      prisma.store.findUnique.mockResolvedValue(STORE);
      prisma.customer.findUnique.mockResolvedValue({ id: "cust-1", name: "Amir" });
      prisma.productVariant.findMany.mockResolvedValue([VARIANT]);
      inventory.getStockOnHand.mockResolvedValue(10);
      tx.loyaltyTransaction.aggregate.mockResolvedValue({ _sum: { pointsDelta: 10 } });
      const service = new SalesService(prisma as any, audit as any, inventory as any, customers as any);

      await expect(
        service.checkout(
          {
            storeId: "store-1",
            customerId: "cust-1",
            lines: [{ variantId: "variant-1", quantity: 1 }],
            payments: [{ method: "cash", amount: 470 }],
            redeemPoints: 100,
          } as any,
          "cashier-1",
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tx.salesOrder.create).not.toHaveBeenCalled();
    });

    it("creates a customer inline, posts earn/redeem ledger entries, and returns a loyalty snapshot", async () => {
      const { prisma, audit, inventory, customers, tx } = buildDeps();
      prisma.store.findUnique.mockResolvedValue(STORE);
      prisma.productVariant.findMany.mockResolvedValue([VARIANT]);
      inventory.getStockOnHand.mockResolvedValue(10);
      tx.store.update.mockResolvedValue({ invoiceSeq: 1 });
      tx.customer.create.mockResolvedValue({ id: "new-cust-1" });
      tx.loyaltyTransaction.aggregate.mockResolvedValue({ _sum: { pointsDelta: 0 } });
      tx.salesOrder.create.mockImplementation(({ data }: any) => ({
        id: "order-2",
        invoiceNumber: data.invoiceNumber,
        customerId: data.customerId,
        lines: data.lines.create.map((l: any, i: number) => ({ id: `line-${i}`, ...l })),
        payments: data.payments.create,
      }));
      customers.getPointsBalance.mockResolvedValue(57);
      customers.computeTier.mockResolvedValue("silver");

      const service = new SalesService(prisma as any, audit as any, inventory as any, customers as any);
      const result = await service.checkout(
        {
          storeId: "store-1",
          newCustomer: { name: "Sara", phone: "0100" },
          lines: [{ variantId: "variant-1", quantity: 2 }],
          payments: [{ method: "cash", amount: 1140 }],
        } as any,
        "cashier-1",
      );

      expect(tx.customer.create).toHaveBeenCalledWith({ data: { name: "Sara", phone: "0100" } });
      expect(tx.salesOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ customerId: "new-cust-1", pointsEarned: 114 }),
        }),
      );
      expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerId: "new-cust-1",
          type: "earn",
          pointsDelta: 114,
          referenceId: "order-2",
        }),
      });
      expect(result.loyaltySnapshot).toEqual({ pointsBalance: 57, tier: "silver" });
    });
  });

  describe("findOne", () => {
    it("throws NotFoundException when the order does not exist", async () => {
      const { prisma, audit, inventory, customers } = buildDeps();
      prisma.salesOrder.findUnique.mockResolvedValue(null);
      const service = new SalesService(prisma as any, audit as any, inventory as any, customers as any);

      await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("getPosCatalog — cashier-safe read model, must never include cost", () => {
    it("flattens active variants with selling price and quantity, and omits cost fields", async () => {
      const { prisma, audit, inventory, customers } = buildDeps();
      prisma.productVariant.findMany.mockResolvedValue([
        {
          id: "variant-1",
          productId: "product-1",
          barcode: "12345",
          sellingPriceOverride: null,
          product: {
            modelName: "Runner 300",
            baseSellingPrice: 500,
            baseCostPrice: 300,
            imageUrl: "https://placehold.co/500x500?text=Runner",
            categoryId: "category-1",
            category: { name: "Running" },
          },
          sizeValue: { standard: "EU", value: "42" },
          color: { name: "Black" },
        },
      ]);
      inventory.listQuantitiesOnHand.mockResolvedValue(new Map([["variant-1", 7]]));

      const service = new SalesService(prisma as any, audit as any, inventory as any, customers as any);
      const result = await service.getPosCatalog("store-1");

      expect(result).toEqual([
        {
          variantId: "variant-1",
          productId: "product-1",
          productName: "Runner 300",
          imageUrl: "https://placehold.co/500x500?text=Runner",
          categoryId: "category-1",
          categoryName: "Running",
          barcode: "12345",
          sizeLabel: "EU 42",
          colorName: "Black",
          sellingPrice: 500,
          quantityOnHand: 7,
        },
      ]);
      expect(prisma.productVariant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true, product: { isActive: true } } }),
      );
    });

    it("defaults quantity to zero for variants with no ledger activity in this store", async () => {
      const { prisma, audit, inventory, customers } = buildDeps();
      prisma.productVariant.findMany.mockResolvedValue([
        {
          id: "variant-2",
          productId: "product-2",
          barcode: "999",
          sellingPriceOverride: "620",
          product: {
            modelName: "Sandal",
            baseSellingPrice: 400,
            imageUrl: null,
            categoryId: "category-2",
            category: { name: "Casual" },
          },
          sizeValue: { standard: "EU", value: "38" },
          color: { name: "White" },
        },
      ]);
      inventory.listQuantitiesOnHand.mockResolvedValue(new Map());

      const service = new SalesService(prisma as any, audit as any, inventory as any, customers as any);
      const result = await service.getPosCatalog("store-1");

      expect(result[0]).toMatchObject({ sellingPrice: 620, quantityOnHand: 0 });
    });
  });
});
