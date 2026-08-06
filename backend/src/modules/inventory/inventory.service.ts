import { Injectable, BadRequestException } from "@nestjs/common";
import { Prisma, StockEntryType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface PostStockMovementParams {
  storeId: string;
  variantId: string;
  entryType: StockEntryType;
  quantityDelta: number;
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  reasonCode?: string;
  performedById: string;
  goodsReceiptLineId?: string;
  purchaseReturnId?: string;
}

type PrismaTx = Prisma.TransactionClient;

/**
 * Owns the append-only stock ledger (Database.md 4.1 / 9.3). This is the ONLY
 * service in the codebase permitted to write stock_ledger_entry rows — other
 * modules (Purchasing today; Sales/Transfers/Counts in later phases) call
 * postStockMovement() instead of touching the table directly. That single
 * choke point is what structurally fixes the source workbook's disconnect
 * between its Sales Tracker and Inventory Tracker sheets (FR-INV-2).
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async postStockMovement(params: PostStockMovementParams, tx?: PrismaTx) {
    const client = tx ?? this.prisma;

    if (params.quantityDelta === 0) {
      throw new BadRequestException("quantityDelta cannot be zero");
    }
    if (params.entryType === "adjustment" && !params.reasonCode) {
      throw new BadRequestException(
        "reasonCode is required for stock adjustments (FR-INV-5)",
      );
    }

    return client.stockLedgerEntry.create({
      data: {
        storeId: params.storeId,
        variantId: params.variantId,
        entryType: params.entryType,
        quantityDelta: params.quantityDelta,
        unitCost: params.unitCost,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        reasonCode: params.reasonCode,
        performedById: params.performedById,
        goodsReceiptLineId: params.goodsReceiptLineId,
        purchaseReturnId: params.purchaseReturnId,
      },
    });
  }

  /** Derived, never stored — stock-on-hand is always SUM(quantity_delta) (FR-INV-1). */
  async getStockOnHand(storeId: string, variantId: string): Promise<number> {
    const result = await this.prisma.stockLedgerEntry.aggregate({
      where: { storeId, variantId },
      _sum: { quantityDelta: true },
    });
    return result._sum.quantityDelta ?? 0;
  }

  async listStockOnHand(storeId: string) {
    const grouped = await this.prisma.stockLedgerEntry.groupBy({
      by: ["variantId"],
      where: { storeId },
      _sum: { quantityDelta: true },
    });

    const variantIds = grouped.map((g) => g.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true, sizeValue: true, color: true },
    });
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    const results = await Promise.all(
      grouped.map(async (g) => {
        const variant = variantMap.get(g.variantId);
        const quantityOnHand = g._sum.quantityDelta ?? 0;
        const avgUnitCost = await this.getWeightedAverageCost(storeId, g.variantId);
        return {
          variantId: g.variantId,
          productName: variant?.product.modelName,
          size: variant?.sizeValue.value,
          color: variant?.color.name,
          barcode: variant?.barcode,
          quantityOnHand,
          avgUnitCost,
          inventoryValue: avgUnitCost !== null ? Number((avgUnitCost * quantityOnHand).toFixed(2)) : null,
        };
      }),
    );

    return results.filter((r) => r.quantityOnHand !== 0);
  }

  /** Total on-hand inventory value across a store (mirrors Inventory Tracker's total). */
  async getTotalInventoryValue(storeId: string): Promise<number> {
    const stock = await this.listStockOnHand(storeId);
    return Number(stock.reduce((sum, s) => sum + (s.inventoryValue ?? 0), 0).toFixed(2));
  }

  /** Weighted-average cost from receipt entries only (FR-INV-9). */
  async getWeightedAverageCost(storeId: string, variantId: string): Promise<number | null> {
    const receipts = await this.prisma.stockLedgerEntry.findMany({
      where: { storeId, variantId, entryType: "receipt", unitCost: { not: null } },
      select: { quantityDelta: true, unitCost: true },
    });
    if (receipts.length === 0) return null;

    let totalQty = 0;
    let totalCost = 0;
    for (const r of receipts) {
      const qty = r.quantityDelta;
      const cost = r.unitCost ? Number(r.unitCost) : 0;
      totalQty += qty;
      totalCost += qty * cost;
    }
    return totalQty === 0 ? null : Number((totalCost / totalQty).toFixed(2));
  }

  /** Fast Moving / Slow Moving / Dead Stock classification (FR-INV-3, business rule #3). */
  async getMovementStatus(storeId: string, variantId: string) {
    const rule = await this.prisma.movementStatusRule.findUnique({ where: { storeId } });
    const fastThreshold = rule ? Number(rule.fastMovingThresholdPct) : 0.7;
    const deadThreshold = rule ? Number(rule.deadStockThresholdPct) : 0.1;

    const [receivedAgg, soldAgg] = await Promise.all([
      this.prisma.stockLedgerEntry.aggregate({
        where: { storeId, variantId, entryType: "receipt" },
        _sum: { quantityDelta: true },
      }),
      this.prisma.stockLedgerEntry.aggregate({
        where: { storeId, variantId, entryType: "sale" },
        _sum: { quantityDelta: true },
      }),
    ]);

    const received = receivedAgg._sum.quantityDelta ?? 0;
    const sold = Math.abs(soldAgg._sum.quantityDelta ?? 0);

    if (received === 0) {
      return { status: "No Stock Received" as const, received, sold, soldRatio: null };
    }

    const soldRatio = sold / received;
    let status: "Fast Moving" | "Slow Moving" | "Dead Stock";
    if (soldRatio >= fastThreshold) status = "Fast Moving";
    else if (soldRatio <= deadThreshold) status = "Dead Stock";
    else status = "Slow Moving";

    return { status, received, sold, soldRatio: Number(soldRatio.toFixed(4)) };
  }

  /** Variants at or below their reorder point, store-wide (FR-INV-8). */
  async getReorderAlerts(storeId: string) {
    const stock = await this.listStockOnHand(storeId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: stock.map((s) => s.variantId) } },
      select: { id: true, reorderPoint: true },
    });
    const reorderMap = new Map(variants.map((v) => [v.id, v.reorderPoint]));

    return stock.filter((s) => {
      const reorderPoint = reorderMap.get(s.variantId) ?? 0;
      return s.quantityOnHand <= reorderPoint;
    });
  }
}
