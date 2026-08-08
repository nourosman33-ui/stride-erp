import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ReturnsService } from "./returns.service";

const DAY = 24 * 60 * 60 * 1000;

function buildDeps() {
  const store = { update: jest.fn().mockResolvedValue({ returnSeq: 1 }) };
  const salesReturn = {
    create: jest.fn().mockResolvedValue({ id: "ret-1" }),
    update: jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: "ret-1", returnNumber: "RET-STORE-000001", ...data }),
    ),
  };
  const salesOrder = { findUnique: jest.fn(), update: jest.fn() };
  const loyaltyTransaction = { create: jest.fn() };
  const productVariant = { findMany: jest.fn().mockResolvedValue([]) };

  const tx = { store, salesReturn, salesOrder, loyaltyTransaction, productVariant };
  const prisma = {
    salesOrder,
    salesReturn,
    productVariant,
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  };
  const audit = { record: jest.fn() };
  const inventory = { postStockMovement: jest.fn() };
  const customers = {
    getPointsBalance: jest.fn().mockResolvedValue(0),
    computeStats: jest.fn().mockResolvedValue({ lifetimeSpending: 0 }),
    computeTier: jest.fn().mockResolvedValue("bronze"),
  };
  const sales = { checkoutInTx: jest.fn() };
  return { prisma, audit, inventory, customers, sales, tx, salesReturn };
}

function makeService(deps = buildDeps()) {
  const service = new ReturnsService(
    deps.prisma as never,
    deps.audit as never,
    deps.inventory as never,
    deps.customers as never,
    deps.sales as never,
  );
  return { service, ...deps };
}

/** A 2-unit sale at 500 each, 14% VAT: subtotal 1000, tax 140, grand total 1140. */
function order(over: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    storeId: "store-1",
    invoiceNumber: "INV-001",
    customerId: "cust-1",
    orderDate: new Date(Date.now() - 2 * DAY),
    status: "completed",
    grandTotal: 1140,
    pointsEarned: 114,
    pointsRedeemed: 0,
    store: { id: "store-1", returnPeriodDays: 14, vatRate: 14 },
    lines: [
      {
        id: "line-1",
        variantId: "v1",
        quantity: 2,
        unitPrice: 500,
        discountAmount: 0,
        taxAmount: 140,
        returnLines: [],
      },
    ],
    ...over,
  };
}

describe("ReturnsService", () => {
  describe("validation", () => {
    it("rejects a return against an unknown sale", async () => {
      const { service, prisma } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(null);
      await expect(
        service.createReturn(
          { originalOrderId: "nope", type: "refund", lines: [{ orderLineId: "l", quantity: 1 }] },
          "user-1",
          ["cashier"],
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses to return a voided sale", async () => {
      const { service, prisma } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(order({ status: "voided" }));
      await expect(
        service.createReturn(
          { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 1 }] },
          "user-1",
          ["cashier"],
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects returning more than was sold", async () => {
      const { service, prisma } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(order());
      await expect(
        service.createReturn(
          { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 3 }] },
          "user-1",
          ["cashier"],
        ),
      ).rejects.toThrow(/2 sold/);
    });

    it("counts previous returns when checking what is still returnable", async () => {
      const { service, prisma } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(
        order({
          lines: [
            {
              id: "line-1",
              variantId: "v1",
              quantity: 2,
              unitPrice: 500,
              discountAmount: 0,
              taxAmount: 140,
              returnLines: [{ quantity: 1 }], // one already came back
            },
          ],
        }),
      );
      await expect(
        service.createReturn(
          { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 2 }] },
          "user-1",
          ["cashier"],
        ),
      ).rejects.toThrow(/1 already returned/);
    });

    it("blocks a cashier outside the return window", async () => {
      const { service, prisma } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(
        order({ orderDate: new Date(Date.now() - 30 * DAY) }),
      );
      await expect(
        service.createReturn(
          { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 1 }] },
          "user-1",
          ["cashier"],
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("still blocks a cashier who sets the override flag themselves", async () => {
      const { service, prisma } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(
        order({ orderDate: new Date(Date.now() - 30 * DAY) }),
      );
      await expect(
        service.createReturn(
          {
            originalOrderId: "order-1",
            type: "refund",
            lines: [{ orderLineId: "line-1", quantity: 1 }],
            overrideReturnWindow: true,
          },
          "user-1",
          ["cashier"],
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lets a manager override the return window", async () => {
      const { service, prisma } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(
        order({ orderDate: new Date(Date.now() - 30 * DAY) }),
      );
      await expect(
        service.createReturn(
          {
            originalOrderId: "order-1",
            type: "refund",
            lines: [{ orderLineId: "line-1", quantity: 1 }],
            overrideReturnWindow: true,
          },
          "mgr-1",
          ["manager"],
        ),
      ).resolves.toBeDefined();
    });

    it("requires replacement items on an exchange", async () => {
      const { service, prisma } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(order());
      await expect(
        service.createReturn(
          { originalOrderId: "order-1", type: "exchange", lines: [{ orderLineId: "line-1", quantity: 1 }] },
          "user-1",
          ["cashier"],
        ),
      ).rejects.toThrow(/replacement item/);
    });
  });

  describe("refund", () => {
    it("refunds the price actually paid plus proportional tax", async () => {
      const { service, prisma, salesReturn } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(order());

      await service.createReturn(
        { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 1 }] },
        "user-1",
        ["cashier"],
      );

      const data = salesReturn.create.mock.calls[0][0].data;
      expect(data.refundSubtotal).toBe(500); // 1 x 500
      expect(data.refundTaxTotal).toBe(70); // half of the 140 tax
      expect(data.refundTotal).toBe(570);
    });

    it("honours the original discount when refunding", async () => {
      const { service, prisma, salesReturn } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(
        order({
          lines: [
            {
              id: "line-1",
              variantId: "v1",
              quantity: 2,
              unitPrice: 500,
              discountAmount: 100, // customer paid 400/unit
              taxAmount: 112,
              returnLines: [],
            },
          ],
        }),
      );

      await service.createReturn(
        { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 1 }] },
        "user-1",
        ["cashier"],
      );

      expect(salesReturn.create.mock.calls[0][0].data.refundSubtotal).toBe(400);
    });

    it("puts restockable goods back through the inventory ledger", async () => {
      const { service, prisma, inventory } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(order());

      await service.createReturn(
        { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 2 }] },
        "user-1",
        ["cashier"],
      );

      expect(inventory.postStockMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          entryType: "sale_return",
          quantityDelta: 2,
          variantId: "v1",
          referenceType: "sales_return",
          referenceId: "ret-1",
        }),
        expect.anything(),
      );
    });

    it("does not restock goods marked damaged", async () => {
      const { service, prisma, inventory } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(order());

      await service.createReturn(
        {
          originalOrderId: "order-1",
          type: "refund",
          lines: [{ orderLineId: "line-1", quantity: 1, restock: false }],
        },
        "user-1",
        ["cashier"],
      );

      expect(inventory.postStockMovement).not.toHaveBeenCalled();
    });

    it("claws back loyalty points in proportion to the refund", async () => {
      const { service, prisma, tx } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(order());

      // Half the 1140 sale comes back → half of the 114 points earned.
      await service.createReturn(
        { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 1 }] },
        "user-1",
        ["cashier"],
      );

      expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pointsDelta: -57, type: "adjustment" }),
        }),
      );
    });

    it("gives back points that were redeemed against the returned value", async () => {
      const { service, prisma, tx } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(
        order({ pointsEarned: 0, pointsRedeemed: 100 }),
      );

      await service.createReturn(
        { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 1 }] },
        "user-1",
        ["cashier"],
      );

      expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ pointsDelta: 50 }) }),
      );
    });

    it("skips the loyalty ledger entirely for a walk-in sale", async () => {
      const { service, prisma, tx } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(order({ customerId: null }));

      await service.createReturn(
        { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 1 }] },
        "user-1",
        ["cashier"],
      );

      expect(tx.loyaltyTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe("original order status", () => {
    it("marks the sale partially_returned when some units come back", async () => {
      const { service, prisma, tx } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(order());

      await service.createReturn(
        { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 1 }] },
        "user-1",
        ["cashier"],
      );

      expect(tx.salesOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "partially_returned" } }),
      );
    });

    it("marks the sale returned once every unit is back", async () => {
      const { service, prisma, tx } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(order());

      await service.createReturn(
        { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 2 }] },
        "user-1",
        ["cashier"],
      );

      expect(tx.salesOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "returned" } }),
      );
    });

    it("completes an order whose earlier partial return is now finished", async () => {
      const { service, prisma, tx } = makeService();
      prisma.salesOrder.findUnique.mockResolvedValue(
        order({
          status: "partially_returned",
          lines: [
            {
              id: "line-1",
              variantId: "v1",
              quantity: 2,
              unitPrice: 500,
              discountAmount: 0,
              taxAmount: 140,
              returnLines: [{ quantity: 1 }],
            },
          ],
        }),
      );

      await service.createReturn(
        { originalOrderId: "order-1", type: "refund", lines: [{ orderLineId: "line-1", quantity: 1 }] },
        "user-1",
        ["cashier"],
      );

      expect(tx.salesOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "returned" } }),
      );
    });
  });

  describe("exchange", () => {
    it("raises the replacement sale inside the same transaction and books the balance", async () => {
      const deps = buildDeps();
      deps.prisma.salesOrder.findUnique.mockResolvedValue(order());
      deps.prisma.productVariant.findMany.mockResolvedValue([
        { id: "v2", sellingPriceOverride: null, product: { baseSellingPrice: 700 } },
      ]);
      deps.sales.checkoutInTx.mockResolvedValue({ id: "order-2", grandTotal: 798 });
      const { service, salesReturn, sales, tx } = makeService(deps);

      await service.createReturn(
        {
          originalOrderId: "order-1",
          type: "exchange",
          lines: [{ orderLineId: "line-1", quantity: 1 }],
          exchangeLines: [{ variantId: "v2", quantity: 1 }],
        },
        "user-1",
        ["cashier"],
      );

      // Replacement sale must run on the *same* tx client the return is using.
      expect(sales.checkoutInTx).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: "store-1", customerId: "cust-1" }),
        "user-1",
        tx,
      );
      // 798 out, 570 back in → customer owes 228.
      const update = salesReturn.update.mock.calls[0][0].data;
      expect(update.exchangeTotal).toBe(798);
      expect(update.balanceDue).toBe(228);
      expect(update.exchangeOrderId).toBe("order-2");
    });

    it("books a negative balance when the replacement is cheaper", async () => {
      const deps = buildDeps();
      deps.prisma.salesOrder.findUnique.mockResolvedValue(order());
      deps.prisma.productVariant.findMany.mockResolvedValue([
        { id: "v2", sellingPriceOverride: null, product: { baseSellingPrice: 300 } },
      ]);
      deps.sales.checkoutInTx.mockResolvedValue({ id: "order-2", grandTotal: 342 });
      const { service, salesReturn } = makeService(deps);

      await service.createReturn(
        {
          originalOrderId: "order-1",
          type: "exchange",
          lines: [{ orderLineId: "line-1", quantity: 1 }],
          exchangeLines: [{ variantId: "v2", quantity: 1 }],
        },
        "user-1",
        ["cashier"],
      );

      expect(salesReturn.update.mock.calls[0][0].data.balanceDue).toBe(-228);
    });

    it("restocks the returned goods before pricing the replacement, so a swap into the same item works", async () => {
      const deps = buildDeps();
      deps.prisma.salesOrder.findUnique.mockResolvedValue(order());
      deps.prisma.productVariant.findMany.mockResolvedValue([
        { id: "v1", sellingPriceOverride: null, product: { baseSellingPrice: 500 } },
      ]);
      deps.sales.checkoutInTx.mockResolvedValue({ id: "order-2", grandTotal: 570 });
      const { service, inventory, sales } = makeService(deps);

      await service.createReturn(
        {
          originalOrderId: "order-1",
          type: "exchange",
          lines: [{ orderLineId: "line-1", quantity: 1 }],
          exchangeLines: [{ variantId: "v1", quantity: 1 }],
        },
        "user-1",
        ["cashier"],
      );

      const restockOrder = inventory.postStockMovement.mock.invocationCallOrder[0];
      const checkoutOrder = sales.checkoutInTx.mock.invocationCallOrder[0];
      expect(restockOrder).toBeLessThan(checkoutOrder);
    });
  });
});
