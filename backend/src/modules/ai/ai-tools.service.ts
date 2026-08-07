import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d = new Date()): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/**
 * Every function here is a "tool" an AiProvider (mock today, OpenAI later — see
 * providers/) can call to ground its answer in real data. This is the *only* place in
 * the AI module that touches Prisma directly; providers never query the database
 * themselves, so swapping the mock provider for a real LLM later changes nothing about
 * what data is trustworthy or how it's computed.
 */
@Injectable()
export class AiToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  private async revenueBetween(storeId: string, from: Date, to: Date) {
    const agg = await this.prisma.salesOrder.aggregate({
      where: { storeId, orderDate: { gte: from, lt: to }, status: { not: "voided" } },
      _sum: { grandTotal: true },
      _count: true,
    });
    return { revenue: Number(agg._sum.grandTotal ?? 0), orderCount: agg._count };
  }

  private async estimateCogs(storeId: string, from: Date, to: Date) {
    const lines = await this.prisma.salesOrderLine.findMany({
      where: { order: { storeId, orderDate: { gte: from, lt: to }, status: { not: "voided" } } },
      select: { variantId: true, quantity: true },
    });
    const byVariant = new Map<string, number>();
    for (const l of lines) {
      byVariant.set(l.variantId, (byVariant.get(l.variantId) ?? 0) + l.quantity);
    }
    let cogs = 0;
    for (const [variantId, qty] of byVariant) {
      const avgCost = await this.inventory.getWeightedAverageCost(storeId, variantId);
      if (avgCost !== null) cogs += avgCost * qty;
    }
    return Number(cogs.toFixed(2));
  }

  async revenueToday(storeId: string) {
    return this.revenueBetween(storeId, startOfDay(), addDays(startOfDay(), 1));
  }

  async profitToday(storeId: string) {
    const from = startOfDay();
    const to = addDays(from, 1);
    const { revenue } = await this.revenueBetween(storeId, from, to);
    const cogs = await this.estimateCogs(storeId, from, to);
    return { revenue, cogs, profit: Number((revenue - cogs).toFixed(2)) };
  }

  async unitsSoldToday(storeId: string) {
    const from = startOfDay();
    const to = addDays(from, 1);
    const agg = await this.prisma.salesOrderLine.aggregate({
      where: { order: { storeId, orderDate: { gte: from, lt: to }, status: { not: "voided" } } },
      _sum: { quantity: true },
    });
    return { unitsSold: agg._sum.quantity ?? 0 };
  }

  /** No expense-tracking module exists in this build yet — honest placeholder, not fabricated data. */
  async expensesToday() {
    return { tracked: false, message: "Expense tracking isn't implemented in STRIDE ERP yet." };
  }

  async bestCashier(storeId: string, from: Date = startOfDay(), to: Date = addDays(startOfDay(), 1)) {
    const grouped = await this.prisma.salesOrder.groupBy({
      by: ["cashierId"],
      where: { storeId, orderDate: { gte: from, lt: to }, status: { not: "voided" } },
      _sum: { grandTotal: true },
      _count: true,
    });
    if (grouped.length === 0) return null;
    const ranked = grouped.sort((a, b) => Number(b._sum.grandTotal ?? 0) - Number(a._sum.grandTotal ?? 0));
    const top = ranked[0];
    const cashier = await this.prisma.user.findUnique({ where: { id: top.cashierId } });
    return {
      cashierId: top.cashierId,
      cashierName: cashier?.fullName ?? "Unknown",
      revenue: Number(top._sum.grandTotal ?? 0),
      orderCount: top._count,
    };
  }

  async fastestSellingProducts(storeId: string, days = 30, limit = 5) {
    const from = addDays(startOfDay(), -days);
    const lines = await this.prisma.salesOrderLine.findMany({
      where: { order: { storeId, orderDate: { gte: from }, status: { not: "voided" } } },
      select: { variantId: true, quantity: true },
    });
    const byVariant = new Map<string, number>();
    for (const l of lines) byVariant.set(l.variantId, (byVariant.get(l.variantId) ?? 0) + l.quantity);
    const top = [...byVariant.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    return this.namedVariantList(top);
  }

  async slowMovingProducts(storeId: string, limit = 10) {
    const stock = await this.inventory.listStockOnHand(storeId);
    const withStatus = await Promise.all(
      stock.map(async (row) => ({
        ...row,
        movement: await this.inventory.getMovementStatus(storeId, row.variantId),
      })),
    );
    return withStatus
      .filter((r) => r.movement.status === "Dead Stock" || r.movement.status === "Slow Moving")
      .sort((a, b) => (a.movement.soldRatio ?? 0) - (b.movement.soldRatio ?? 0))
      .slice(0, limit)
      .map((r) => ({
        variantId: r.variantId,
        productName: r.productName,
        quantityOnHand: r.quantityOnHand,
        status: r.movement.status,
      }));
  }

  reorderSuggestions(storeId: string) {
    return this.inventory.getReorderAlerts(storeId);
  }

  async inventoryValue(storeId: string) {
    const total = await this.inventory.getTotalInventoryValue(storeId);
    return { totalInventoryValue: total };
  }

  /** Ranks suppliers by their latest outstanding balance (most owed first). */
  async supplierPayables(limit = 5) {
    const suppliers = await this.prisma.supplier.findMany({ where: { isActive: true } });
    const withBalance = await Promise.all(
      suppliers.map(async (s) => {
        const latest = await this.prisma.supplierLedgerEntry.findFirst({
          where: { supplierId: s.id },
          orderBy: { createdAt: "desc" },
        });
        return { supplierId: s.id, supplierName: s.name, balanceOwed: Number(latest?.balanceAfter ?? 0) };
      }),
    );
    return withBalance
      .filter((s) => s.balanceOwed > 0)
      .sort((a, b) => b.balanceOwed - a.balanceOwed)
      .slice(0, limit);
  }

  async weekComparison(storeId: string) {
    const thisWeekStart = startOfWeek();
    const lastWeekStart = addDays(thisWeekStart, -7);
    const [thisWeek, lastWeek] = await Promise.all([
      this.revenueBetween(storeId, thisWeekStart, addDays(thisWeekStart, 7)),
      this.revenueBetween(storeId, lastWeekStart, thisWeekStart),
    ]);
    return {
      thisWeekRevenue: thisWeek.revenue,
      lastWeekRevenue: lastWeek.revenue,
      changePct: lastWeek.revenue > 0 ? Number((((thisWeek.revenue - lastWeek.revenue) / lastWeek.revenue) * 100).toFixed(1)) : null,
    };
  }

  async monthComparison(storeId: string) {
    const thisMonthStart = startOfMonth();
    const lastMonthStart = startOfMonth(addDays(thisMonthStart, -1));
    const [thisMonth, lastMonth] = await Promise.all([
      this.revenueBetween(storeId, thisMonthStart, addDays(startOfDay(), 1)),
      this.revenueBetween(storeId, lastMonthStart, thisMonthStart),
    ]);
    return {
      thisMonthRevenue: thisMonth.revenue,
      lastMonthRevenue: lastMonth.revenue,
      changePct: lastMonth.revenue > 0 ? Number((((thisMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100).toFixed(1)) : null,
    };
  }

  /** Dead/slow stock is exactly what should be discounted to clear it. */
  discountCandidates(storeId: string) {
    return this.slowMovingProducts(storeId);
  }

  /** Fast movers can typically bear a price increase without hurting demand. */
  async priceIncreaseCandidates(storeId: string, limit = 5) {
    const stock = await this.inventory.listStockOnHand(storeId);
    const withStatus = await Promise.all(
      stock.map(async (row) => ({
        ...row,
        movement: await this.inventory.getMovementStatus(storeId, row.variantId),
      })),
    );
    return withStatus
      .filter((r) => r.movement.status === "Fast Moving")
      .sort((a, b) => (b.movement.soldRatio ?? 0) - (a.movement.soldRatio ?? 0))
      .slice(0, limit)
      .map((r) => ({ variantId: r.variantId, productName: r.productName, soldRatio: r.movement.soldRatio }));
  }

  /** Naive linear projection from the trailing-14-day daily average — clearly labeled as an estimate. */
  async forecastEndOfMonthRevenue(storeId: string) {
    const monthStart = startOfMonth();
    const today = startOfDay();
    const trailingStart = addDays(today, -14);
    const [monthToDate, trailing] = await Promise.all([
      this.revenueBetween(storeId, monthStart, addDays(today, 1)),
      this.revenueBetween(storeId, trailingStart, addDays(today, 1)),
    ]);
    const daysElapsedTrailing = Math.max(1, Math.round((today.getTime() - trailingStart.getTime()) / 86400000));
    const dailyAvg = trailing.revenue / daysElapsedTrailing;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - today.getDate();
    const forecast = Number((monthToDate.revenue + dailyAvg * daysRemaining).toFixed(2));
    return { monthToDateRevenue: monthToDate.revenue, dailyAverage: Number(dailyAvg.toFixed(2)), forecastEndOfMonthRevenue: forecast };
  }

  /** Days-of-cover from the trailing-30-day sell-through rate; flags anything under 14 days. */
  async forecastStockShortages(storeId: string, coverDaysThreshold = 14) {
    const from = addDays(startOfDay(), -30);
    const [stock, lines] = await Promise.all([
      this.inventory.listStockOnHand(storeId),
      this.prisma.salesOrderLine.findMany({
        where: { order: { storeId, orderDate: { gte: from }, status: { not: "voided" } } },
        select: { variantId: true, quantity: true },
      }),
    ]);
    const soldByVariant = new Map<string, number>();
    for (const l of lines) soldByVariant.set(l.variantId, (soldByVariant.get(l.variantId) ?? 0) + l.quantity);

    return stock
      .map((row) => {
        const sold30d = soldByVariant.get(row.variantId) ?? 0;
        const dailyRate = sold30d / 30;
        const daysOfCover = dailyRate > 0 ? row.quantityOnHand / dailyRate : Infinity;
        return { variantId: row.variantId, productName: row.productName, quantityOnHand: row.quantityOnHand, daysOfCover: Number.isFinite(daysOfCover) ? Math.round(daysOfCover) : null };
      })
      .filter((r) => r.daysOfCover !== null && r.daysOfCover < coverDaysThreshold)
      .sort((a, b) => (a.daysOfCover ?? 0) - (b.daysOfCover ?? 0));
  }

  private async namedVariantList(entries: [string, number][]) {
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: entries.map(([id]) => id) } },
      include: { product: true, sizeValue: true, color: true },
    });
    const map = new Map(variants.map((v) => [v.id, v]));
    return entries.map(([variantId, unitsSold]) => {
      const v = map.get(variantId);
      return {
        variantId,
        productName: v?.product.modelName ?? "Unknown",
        sizeLabel: v ? `${v.sizeValue.standard} ${v.sizeValue.value}` : "",
        colorName: v?.color.name ?? "",
        unitsSold,
      };
    });
  }
}
