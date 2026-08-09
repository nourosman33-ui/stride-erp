import { BadRequestException } from "@nestjs/common";
import { InventoryService } from "./inventory.service";

function buildPrismaMock() {
  return {
    stockLedgerEntry: {
      create: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    productVariant: { findMany: jest.fn() },
    movementStatusRule: { findUnique: jest.fn() },
    // revalueStock runs its compensating entries in one transaction.
    $transaction: jest.fn((cb) => cb({ stockLedgerEntry: { create: jest.fn() } })),
  };
}

describe("InventoryService", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: InventoryService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new InventoryService(prisma as any);
  });

  describe("postStockMovement — the only write path to the stock ledger (FR-INV-1/2)", () => {
    it("rejects a zero quantity delta", async () => {
      await expect(
        service.postStockMovement({
          storeId: "s1",
          variantId: "v1",
          entryType: "sale",
          quantityDelta: 0,
          performedById: "u1",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
    });

    it("requires a reasonCode for adjustments (FR-INV-5)", async () => {
      await expect(
        service.postStockMovement({
          storeId: "s1",
          variantId: "v1",
          entryType: "adjustment",
          quantityDelta: -2,
          performedById: "u1",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
    });

    it("persists a valid receipt entry", async () => {
      prisma.stockLedgerEntry.create.mockResolvedValue({ id: "entry-1" });

      const result = await service.postStockMovement({
        storeId: "s1",
        variantId: "v1",
        entryType: "receipt",
        quantityDelta: 120,
        unitCost: 250,
        performedById: "u1",
      });

      expect(result).toEqual({ id: "entry-1" });
      expect(prisma.stockLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quantityDelta: 120, entryType: "receipt" }),
        }),
      );
    });
  });

  describe("getStockOnHand — always a derived sum, never a stored counter (FR-INV-1)", () => {
    it("defaults to zero when there are no ledger entries", async () => {
      prisma.stockLedgerEntry.aggregate.mockResolvedValue({ _sum: { quantityDelta: null } });
      await expect(service.getStockOnHand("s1", "v1")).resolves.toBe(0);
    });

    it("returns the aggregated sum of all movements", async () => {
      prisma.stockLedgerEntry.aggregate.mockResolvedValue({ _sum: { quantityDelta: 75 } });
      await expect(service.getStockOnHand("s1", "v1")).resolves.toBe(75);
    });
  });

  describe("listQuantitiesOnHand — cost-free derivative for cashier-facing surfaces", () => {
    it("maps variantId to summed quantity, defaulting nulls to zero", async () => {
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([
        { variantId: "v1", _sum: { quantityDelta: 12 } },
        { variantId: "v2", _sum: { quantityDelta: null } },
      ]);

      const result = await service.listQuantitiesOnHand("s1");

      expect(result.get("v1")).toBe(12);
      expect(result.get("v2")).toBe(0);
    });
  });

  describe("listStockOnHand / getReorderAlerts — zero-quantity handling", () => {
    /** v1 has stock, v2 has sold out to exactly zero. */
    function primeStock() {
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([
        { variantId: "v1", _sum: { quantityDelta: 4 } },
        { variantId: "v2", _sum: { quantityDelta: 0 } },
      ]);
      prisma.productVariant.findMany.mockImplementation((args: { select?: unknown }) =>
        Promise.resolve(
          args?.select
            ? [
                { id: "v1", reorderPoint: 1 },
                { id: "v2", reorderPoint: 1 },
              ]
            : [
                {
                  id: "v1",
                  barcode: "b1",
                  product: { modelName: "Runner" },
                  sizeValue: { value: "41" },
                  color: { name: "Black" },
                },
                {
                  id: "v2",
                  barcode: "b2",
                  product: { modelName: "Trainer" },
                  sizeValue: { value: "42" },
                  color: { name: "White" },
                },
              ],
        ),
      );
      // Weighted-average cost lookup per variant.
      prisma.stockLedgerEntry.findMany.mockResolvedValue([{ quantityDelta: 10, unitCost: 200 }]);
    }

    it("hides sold-out variants from the stock listing", async () => {
      primeStock();
      const rows = await service.listStockOnHand("s1");
      expect(rows.map((r) => r.variantId)).toEqual(["v1"]);
    });

    it("still raises a reorder alert for a sold-out variant", async () => {
      primeStock();
      const alerts = await service.getReorderAlerts("s1");
      // v2 is at zero — the most urgent reorder there is, so it must not be filtered out.
      expect(alerts.map((a) => a.variantId).sort()).toEqual(["v2"]);
    });
  });

  describe("getMovementStatus — Fast/Slow/Dead classification (FR-INV-3)", () => {
    it("classifies Fast Moving at/above the configured threshold", async () => {
      prisma.movementStatusRule.findUnique.mockResolvedValue({
        fastMovingThresholdPct: 0.7,
        deadStockThresholdPct: 0.1,
      });
      prisma.stockLedgerEntry.aggregate
        .mockResolvedValueOnce({ _sum: { quantityDelta: 100 } }) // received
        .mockResolvedValueOnce({ _sum: { quantityDelta: -70 } }); // sold (stored as negative delta)

      const result = await service.getMovementStatus("s1", "v1");
      expect(result.status).toBe("Fast Moving");
      expect(result.soldRatio).toBeCloseTo(0.7);
    });

    it("classifies Dead Stock at/below the default threshold when no rule is configured", async () => {
      prisma.movementStatusRule.findUnique.mockResolvedValue(null);
      prisma.stockLedgerEntry.aggregate
        .mockResolvedValueOnce({ _sum: { quantityDelta: 100 } })
        .mockResolvedValueOnce({ _sum: { quantityDelta: -5 } });

      const result = await service.getMovementStatus("s1", "v1");
      expect(result.status).toBe("Dead Stock");
    });

    it("classifies Slow Moving strictly between the two thresholds", async () => {
      prisma.movementStatusRule.findUnique.mockResolvedValue({
        fastMovingThresholdPct: 0.7,
        deadStockThresholdPct: 0.1,
      });
      prisma.stockLedgerEntry.aggregate
        .mockResolvedValueOnce({ _sum: { quantityDelta: 100 } })
        .mockResolvedValueOnce({ _sum: { quantityDelta: -40 } });

      const result = await service.getMovementStatus("s1", "v1");
      expect(result.status).toBe("Slow Moving");
    });

    it("reports 'No Stock Received' distinctly from Dead Stock when nothing was ever received", async () => {
      prisma.movementStatusRule.findUnique.mockResolvedValue(null);
      prisma.stockLedgerEntry.aggregate
        .mockResolvedValueOnce({ _sum: { quantityDelta: 0 } })
        .mockResolvedValueOnce({ _sum: { quantityDelta: 0 } });

      const result = await service.getMovementStatus("s1", "v1");
      expect(result.status).toBe("No Stock Received");
    });
  });
});

describe("InventoryService.revalueStock — correcting stock booked at the wrong cost", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: InventoryService;
  let posted: Record<string, unknown>[];

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new InventoryService(prisma as any);
    posted = [];
    // Capture what the revaluation writes instead of hitting a database.
    jest.spyOn(service, "postStockMovement").mockImplementation(async (params: never) => {
      posted.push(params);
      return params as never;
    });
  });

  /** on-hand = `onHand`; costed receipts totalling `receiptQty` at `unitCost`. */
  function primeStock(onHand: number, receiptQty: number, unitCost: number | null) {
    prisma.stockLedgerEntry.aggregate.mockResolvedValue({ _sum: { quantityDelta: onHand } });
    prisma.stockLedgerEntry.findMany.mockResolvedValue(
      receiptQty > 0 ? [{ quantityDelta: receiptQty, unitCost }] : [],
    );
  }

  it("reverses the old cost and re-books at the new one, leaving quantity untouched", async () => {
    primeStock(10, 10, 0); // 10 units booked at 0 — the reported bug
    const result = await service.revalueStock({
      storeId: "s1",
      variantId: "v1",
      newUnitCost: 250,
      performedById: "u1",
    });

    expect(posted).toHaveLength(2);
    expect(posted[0]).toMatchObject({ entryType: "receipt", quantityDelta: -10, unitCost: 0 });
    expect(posted[1]).toMatchObject({ entryType: "receipt", quantityDelta: 10, unitCost: 250 });
    // The two entries cancel, so stock on hand cannot move.
    expect((posted[0].quantityDelta as number) + (posted[1].quantityDelta as number)).toBe(0);
    expect(result).toMatchObject({ previousUnitCost: 0, newUnitCost: 250, inventoryValue: 2500 });
  });

  it("produces a weighted average equal to the new cost", async () => {
    primeStock(10, 10, 0);
    await service.revalueStock({ storeId: "s1", variantId: "v1", newUnitCost: 250, performedById: "u1" });

    // Replay the arithmetic getWeightedAverageCost would do over the resulting rows.
    const rows = [{ quantityDelta: 10, unitCost: 0 }, ...posted.map((p) => ({
      quantityDelta: p.quantityDelta as number,
      unitCost: (p.unitCost as number) ?? 0,
    }))];
    const qty = rows.reduce((s, r) => s + r.quantityDelta, 0);
    const cost = rows.reduce((s, r) => s + r.quantityDelta * r.unitCost, 0);
    expect(cost / qty).toBe(250);
  });

  it("costs stock that only ever arrived by adjustment, without changing quantity", async () => {
    primeStock(8, 0, null); // no costed receipts at all
    await service.revalueStock({ storeId: "s1", variantId: "v1", newUnitCost: 100, performedById: "u1" });

    expect(posted[0]).toMatchObject({ entryType: "receipt", quantityDelta: 8, unitCost: 100 });
    // Adjustments are excluded from the average, so this cancels the qty but not the cost.
    expect(posted[1]).toMatchObject({ entryType: "adjustment", quantityDelta: -8 });
    expect((posted[0].quantityDelta as number) + (posted[1].quantityDelta as number)).toBe(0);
  });

  it("refuses to revalue an item with no stock on hand", async () => {
    primeStock(0, 0, null);
    await expect(
      service.revalueStock({ storeId: "s1", variantId: "v1", newUnitCost: 100, performedById: "u1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(posted).toHaveLength(0);
  });

  it("rejects a negative cost", async () => {
    primeStock(10, 10, 50);
    await expect(
      service.revalueStock({ storeId: "s1", variantId: "v1", newUnitCost: -5, performedById: "u1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("tags both entries as a revaluation so the ledger explains itself", async () => {
    primeStock(10, 10, 0);
    await service.revalueStock({
      storeId: "s1", variantId: "v1", newUnitCost: 250, performedById: "u1", reason: "priced_after_stocking",
    });
    for (const p of posted) {
      expect(p).toMatchObject({ referenceType: "revaluation", reasonCode: "priced_after_stocking" });
    }
  });
});
