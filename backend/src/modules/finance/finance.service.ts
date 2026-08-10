import { Injectable, NotFoundException } from "@nestjs/common";
import { ExpenseCategory, OperatingExpense, PaymentMethodType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  FREQUENCY_DAY_DIVISOR,
  MS_PER_DAY,
  money,
  pct,
  ratio,
} from "./finance.constants";

/**
 * Only `voided` is excluded — a voided sale never happened. Returned and partially-returned
 * sales DID happen and stay in revenue at full value; the refund is then subtracted as
 * contra-revenue below. That is the correct "sales less returns and allowances" treatment,
 * and it is the only one that handles partial returns: excluding whole orders would either
 * wipe out revenue that was genuinely kept, or (for partials) miss the refund entirely.
 */
const REVENUE_STATUS_FILTER: Prisma.EnumSalesOrderStatusFilter = { not: "voided" };

export interface PeriodPnl {
  from: string;
  to: string;
  days: number;
  // Revenue
  grossRevenue: number; // what customers actually paid, VAT included, net of refunds
  vatCollected: number; // liability owed to the tax authority — NOT income
  discountsGiven: number;
  grossSalesNet: number; // ex-VAT sales BEFORE returns are deducted
  returnsNetValue: number; // ex-VAT value refunded — contra-revenue
  returnsTotal: number; // refunded incl. VAT
  returnCount: number;
  netRevenue: number; // grossSalesNet − returnsNetValue: the correct base for margin
  // Cost of sales
  cogs: number; // net of the cost of goods that came back and were restocked
  grossProfit: number;
  grossMarginPct: number | null;
  // Operating costs
  operatingExpenses: number;
  expenseBreakdown: { category: ExpenseCategory; label: string; amount: number }[];
  netProfit: number;
  netMarginPct: number | null;
  // Volume / unit economics
  orderCount: number;
  unitsSold: number;
  averageBasket: number | null;
  grossProfitPerOrder: number | null;
}

export interface DailyPoint {
  date: string;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  // ---------------------------------------------------------------- helpers

  private startOfDay(d = new Date()): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private addDays(d: Date, days: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  }

  private daysBetween(from: Date, to: Date): number {
    return Math.max(0, (to.getTime() - from.getTime()) / MS_PER_DAY);
  }

  /** Local calendar date as YYYY-MM-DD — built from local Y/M/D getters rather
   * than `toISOString().slice(0,10)`, which round-trips through UTC and silently
   * shifts the label back a day for any positive-offset timezone (e.g. this
   * store's Africa/Cairo, UTC+3) since `startOfDay` zeroes hours in local time. */
  private isoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  /**
   * What a single declared expense actually costs inside [from, to).
   * Recurring costs are pro-rated over the days they were live — an expense that starts
   * mid-window or was closed mid-window only charges for its overlap, so historical
   * periods never move when today's cost base is edited.
   */
  expenseChargeForWindow(expense: OperatingExpense, from: Date, to: Date): number {
    const amount = Number(expense.amount);
    const { frequency } = expense;
    const start = new Date(expense.startDate);
    const end = expense.endDate ? new Date(expense.endDate) : null;

    if (frequency === "one_time") {
      // Charged in full to the window containing its date, not spread.
      return start >= from && start < to ? money(amount) : 0;
    }

    const overlapStart = start > from ? start : from;
    const overlapEnd = end && end < to ? end : to;
    const overlapDays = this.daysBetween(overlapStart, overlapEnd);
    if (overlapDays <= 0) return 0;

    const dailyRate = amount / FREQUENCY_DAY_DIVISOR[frequency];
    return money(dailyRate * overlapDays);
  }

  /** Normalised monthly run-rate of the *currently active* recurring cost base. */
  monthlyRunRate(expenses: OperatingExpense[]): number {
    const daily = expenses.reduce((sum, e) => {
      // One-off costs are real spend but not a recurring commitment, so they never
      // inflate the run-rate that break-even and runway are derived from.
      if (!e.isActive || e.frequency === "one_time") return sum;
      return sum + Number(e.amount) / FREQUENCY_DAY_DIVISOR[e.frequency];
    }, 0);
    return money(daily * DAYS_PER_MONTH);
  }

  /**
   * Weighted-average unit cost for many variants in ONE query.
   * InventoryService.getWeightedAverageCost is per-variant; calling it inside a COGS loop
   * would issue a query per variant sold. Same formula, batched.
   */
  private async costMap(storeId: string, variantIds: string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const receipts = await this.prisma.stockLedgerEntry.findMany({
      where: {
        storeId,
        entryType: "receipt",
        unitCost: { not: null },
        variantId: { in: variantIds },
      },
      select: { variantId: true, quantityDelta: true, unitCost: true },
    });

    const totals = new Map<string, { qty: number; cost: number }>();
    for (const r of receipts) {
      const acc = totals.get(r.variantId) ?? { qty: 0, cost: 0 };
      acc.qty += r.quantityDelta;
      acc.cost += r.quantityDelta * Number(r.unitCost ?? 0);
      totals.set(r.variantId, acc);
    }

    const result = new Map<string, number>();
    for (const [variantId, { qty, cost }] of totals) {
      if (qty > 0) result.set(variantId, cost / qty);
    }
    return result;
  }

  // ------------------------------------------------------------------- P&L

  async getPnl(storeId: string, from: Date, to: Date): Promise<PeriodPnl> {
    const [orderAgg, lines, expenses, returnAgg, returnLines] = await Promise.all([
      this.prisma.salesOrder.aggregate({
        where: { storeId, orderDate: { gte: from, lt: to }, status: REVENUE_STATUS_FILTER },
        _sum: { subtotal: true, discountTotal: true, taxTotal: true, grandTotal: true },
        _count: true,
      }),
      this.prisma.salesOrderLine.findMany({
        where: {
          order: { storeId, orderDate: { gte: from, lt: to }, status: REVENUE_STATUS_FILTER },
        },
        select: { variantId: true, quantity: true },
      }),
      this.activeExpensesForWindow(storeId, from, to),
      // Returns are dated when the goods came back, not when the sale happened — a refund
      // in August against a July sale reduces August's revenue, which is how the cash and
      // the stock actually moved.
      this.prisma.salesReturn.aggregate({
        where: { storeId, returnDate: { gte: from, lt: to } },
        _sum: { refundSubtotal: true, refundTaxTotal: true, refundTotal: true },
        _count: true,
      }),
      this.prisma.salesReturnLine.findMany({
        where: { salesReturn: { storeId, returnDate: { gte: from, lt: to } } },
        select: { variantId: true, quantity: true, restock: true },
      }),
    ]);

    const subtotal = Number(orderAgg._sum.subtotal ?? 0);
    const discountsGiven = Number(orderAgg._sum.discountTotal ?? 0);
    const grossSalesNet = money(subtotal - discountsGiven);

    const returnsNetValue = money(Number(returnAgg._sum.refundSubtotal ?? 0));
    const returnsTax = money(Number(returnAgg._sum.refundTaxTotal ?? 0));
    const returnsTotal = money(Number(returnAgg._sum.refundTotal ?? 0));

    // VAT is collected on behalf of the tax authority — excluding it is what makes the
    // margin below a real margin rather than an inflated one.
    const vatCollected = money(Number(orderAgg._sum.taxTotal ?? 0) - returnsTax);
    const grossRevenue = money(Number(orderAgg._sum.grandTotal ?? 0) - returnsTotal);
    const netRevenue = money(grossSalesNet - returnsNetValue);

    const soldByVariant = new Map<string, number>();
    for (const l of lines) {
      soldByVariant.set(l.variantId, (soldByVariant.get(l.variantId) ?? 0) + l.quantity);
    }
    // Only restocked goods reverse their cost. Items written off as damaged were still
    // paid for and never came back to the shelf, so their cost stays in COGS as a real loss.
    for (const r of returnLines) {
      if (!r.restock) continue;
      soldByVariant.set(r.variantId, (soldByVariant.get(r.variantId) ?? 0) - r.quantity);
    }

    const unitsSold =
      lines.reduce((sum, l) => sum + l.quantity, 0) -
      returnLines.reduce((sum, r) => sum + r.quantity, 0);

    const costs = await this.costMap(storeId, [...soldByVariant.keys()]);
    let cogs = 0;
    for (const [variantId, qty] of soldByVariant) {
      cogs += (costs.get(variantId) ?? 0) * qty;
    }
    cogs = money(cogs);

    const grossProfit = money(netRevenue - cogs);

    const breakdownMap = new Map<string, { category: ExpenseCategory; label: string; amount: number }>();
    let operatingExpenses = 0;
    for (const e of expenses) {
      const charge = this.expenseChargeForWindow(e, from, to);
      if (charge <= 0) continue;
      operatingExpenses += charge;
      const key = `${e.category}:${e.label}`;
      const existing = breakdownMap.get(key);
      if (existing) existing.amount = money(existing.amount + charge);
      else breakdownMap.set(key, { category: e.category, label: e.label, amount: charge });
    }
    operatingExpenses = money(operatingExpenses);

    const netProfit = money(grossProfit - operatingExpenses);
    const orderCount = orderAgg._count;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      days: money(this.daysBetween(from, to)),
      grossRevenue,
      vatCollected,
      discountsGiven: money(discountsGiven),
      grossSalesNet,
      returnsNetValue,
      returnsTotal,
      returnCount: returnAgg._count,
      netRevenue,
      cogs,
      grossProfit,
      grossMarginPct: pct(grossProfit, netRevenue),
      operatingExpenses,
      expenseBreakdown: [...breakdownMap.values()].sort((a, b) => b.amount - a.amount),
      netProfit,
      netMarginPct: pct(netProfit, netRevenue),
      orderCount,
      unitsSold,
      averageBasket: orderCount > 0 ? money(netRevenue / orderCount) : null,
      grossProfitPerOrder: orderCount > 0 ? money(grossProfit / orderCount) : null,
    };
  }

  private activeExpensesForWindow(storeId: string, from: Date, to: Date) {
    return this.prisma.operatingExpense.findMany({
      where: {
        storeId,
        isActive: true,
        startDate: { lt: to },
        OR: [{ endDate: null }, { endDate: { gt: from } }],
      },
      orderBy: [{ category: "asc" }, { label: "asc" }],
    });
  }

  /** Per-day series for trend charts — two queries total, regardless of window length. */
  async getDailySeries(storeId: string, from: Date, to: Date): Promise<DailyPoint[]> {
    const [lines, expenses, returnLines] = await Promise.all([
      this.prisma.salesOrderLine.findMany({
        where: {
          order: { storeId, orderDate: { gte: from, lt: to }, status: REVENUE_STATUS_FILTER },
        },
        select: {
          variantId: true,
          quantity: true,
          netPrice: true,
          order: { select: { orderDate: true } },
        },
      }),
      this.activeExpensesForWindow(storeId, from, to),
      this.prisma.salesReturnLine.findMany({
        where: { salesReturn: { storeId, returnDate: { gte: from, lt: to } } },
        select: {
          variantId: true,
          quantity: true,
          refundAmount: true,
          restock: true,
          salesReturn: { select: { returnDate: true } },
        },
      }),
    ]);

    const costs = await this.costMap(storeId, [
      ...new Set([...lines.map((l) => l.variantId), ...returnLines.map((r) => r.variantId)]),
    ]);

    // SUM(line.netPrice) === subtotal − discountTotal by construction in
    // SalesService.checkout, so bucketing lines gives the same ex-VAT revenue the
    // order-level aggregate reports.
    const buckets = new Map<string, { netRevenue: number; cogs: number }>();
    for (const l of lines) {
      const key = this.isoDate(this.startOfDay(l.order.orderDate));
      const b = buckets.get(key) ?? { netRevenue: 0, cogs: 0 };
      b.netRevenue += Number(l.netPrice);
      b.cogs += (costs.get(l.variantId) ?? 0) * l.quantity;
      buckets.set(key, b);
    }
    // Refunds land on the day the goods came back, mirroring getPnl.
    for (const r of returnLines) {
      const key = this.isoDate(this.startOfDay(r.salesReturn.returnDate));
      const b = buckets.get(key) ?? { netRevenue: 0, cogs: 0 };
      b.netRevenue -= Number(r.refundAmount);
      if (r.restock) b.cogs -= (costs.get(r.variantId) ?? 0) * r.quantity;
      buckets.set(key, b);
    }

    const points: DailyPoint[] = [];
    for (let d = this.startOfDay(from); d < to; d = this.addDays(d, 1)) {
      const dayEnd = this.addDays(d, 1);
      const key = this.isoDate(d);
      const b = buckets.get(key) ?? { netRevenue: 0, cogs: 0 };
      const opex = money(
        expenses.reduce((sum, e) => sum + this.expenseChargeForWindow(e, d, dayEnd), 0),
      );
      const netRevenue = money(b.netRevenue);
      const cogs = money(b.cogs);
      const grossProfit = money(netRevenue - cogs);
      points.push({
        date: key,
        netRevenue,
        cogs,
        grossProfit,
        operatingExpenses: opex,
        netProfit: money(grossProfit - opex),
      });
    }
    return points;
  }

  // -------------------------------------------------------------- overview

  /**
   * The Financials tab payload: P&L across the standard reporting windows plus the
   * forward-looking planning metrics (break-even, payback, runway, working capital).
   */
  async getOverview(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException(`Store ${storeId} not found`);

    const now = new Date();
    const today = this.startOfDay(now);
    const tomorrow = this.addDays(today, 1);
    const weekStart = this.addDays(today, -today.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30Start = this.addDays(today, -29);
    const inceptionStart = this.startOfDay(
      store.financialStartDate ?? store.openingDate ?? store.createdAt,
    );

    const [daily, weekly, monthly, last30, inception, expenses, inventoryValue, series] =
      await Promise.all([
        this.getPnl(storeId, today, tomorrow),
        this.getPnl(storeId, weekStart, tomorrow),
        this.getPnl(storeId, monthStart, tomorrow),
        this.getPnl(storeId, last30Start, tomorrow),
        this.getPnl(storeId, inceptionStart, tomorrow),
        this.prisma.operatingExpense.findMany({
          where: { storeId },
          orderBy: [{ isActive: "desc" }, { category: "asc" }],
        }),
        this.inventory.getTotalInventoryValue(storeId),
        this.getDailySeries(storeId, last30Start, tomorrow),
      ]);

    const monthlyFixedCosts = this.monthlyRunRate(expenses);
    const dailyFixedCosts = money(monthlyFixedCosts / DAYS_PER_MONTH);
    const weeklyFixedCosts = money(dailyFixedCosts * 7);

    // Trailing 30 days is the stable basis for forward-looking metrics — a single slow
    // day would otherwise swing break-even and payback wildly.
    const marginBasisPct = last30.grossMarginPct;
    const breakEvenMonthlyRevenue =
      marginBasisPct && marginBasisPct > 0
        ? money(monthlyFixedCosts / (marginBasisPct / 100))
        : null;

    const initialInvestment = Number(store.initialInvestment);
    const monthlyNetProfitRunRate = money((last30.netProfit / Math.max(1, last30.days)) * DAYS_PER_MONTH);
    const capitalPosition = money(initialInvestment + inception.netProfit);

    return {
      currency: store.currency,
      generatedAt: now.toISOString(),
      periods: { daily, weekly, monthly, last30Days: last30, inceptionToDate: inception },
      costBase: {
        expenses,
        dailyFixedCosts,
        weeklyFixedCosts,
        monthlyFixedCosts,
        annualFixedCosts: money(dailyFixedCosts * DAYS_PER_YEAR),
      },
      planning: {
        initialInvestment: money(initialInvestment),
        capitalPosition,
        cumulativeNetProfit: inception.netProfit,
        roiPct: pct(inception.netProfit, initialInvestment),
        // Months of current run-rate profit needed to return the capital.
        paybackMonths:
          monthlyNetProfitRunRate > 0 ? ratio(initialInvestment, monthlyNetProfitRunRate) : null,
        monthlyNetProfitRunRate,
        // Only meaningful while burning cash.
        cashRunwayMonths:
          monthlyNetProfitRunRate < 0
            ? ratio(capitalPosition, Math.abs(monthlyNetProfitRunRate))
            : null,
        breakEvenMonthlyRevenue,
        breakEvenDailyRevenue: breakEvenMonthlyRevenue
          ? money(breakEvenMonthlyRevenue / DAYS_PER_MONTH)
          : null,
        breakEvenOrdersPerMonth:
          breakEvenMonthlyRevenue && last30.averageBasket
            ? Math.ceil(breakEvenMonthlyRevenue / last30.averageBasket)
            : null,
        marginBasisPct,
      },
      workingCapital: {
        inventoryValueAtCost: money(inventoryValue),
        // Annualised turns against inventory held at cost.
        inventoryTurnover: ratio(
          (last30.cogs / Math.max(1, last30.days)) * DAYS_PER_YEAR,
          inventoryValue,
        ),
        daysInventoryOutstanding:
          last30.cogs > 0
            ? ratio(inventoryValue * Math.max(1, last30.days), last30.cogs)
            : null,
      },
      series,
    };
  }

  // ------------------------------------------------------- expense CRUD

  listExpenses(storeId: string) {
    return this.prisma.operatingExpense.findMany({
      where: { storeId },
      orderBy: [{ isActive: "desc" }, { category: "asc" }, { label: "asc" }],
    });
  }

  createExpense(data: Prisma.OperatingExpenseUncheckedCreateInput) {
    return this.prisma.operatingExpense.create({ data });
  }

  async updateExpense(id: string, data: Prisma.OperatingExpenseUncheckedUpdateInput) {
    await this.ensureExpenseExists(id);
    return this.prisma.operatingExpense.update({ where: { id }, data });
  }

  /** Soft-close: keeps the row so historical periods still reflect the cost as incurred. */
  async closeExpense(id: string, endDate: Date) {
    await this.ensureExpenseExists(id);
    return this.prisma.operatingExpense.update({
      where: { id },
      data: { isActive: false, endDate },
    });
  }

  private async ensureExpenseExists(id: string) {
    const found = await this.prisma.operatingExpense.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`Operating expense ${id} not found`);
    return found;
  }

  // --------------------------------------------------- daily-expenses module glue
  //
  // The only two things the new expenses/financial-dashboard module needs from here.
  // Everything above is untouched — "Total Expenses" in that module is computed by
  // adding this to the new module's own DailyExpense totals, never inside getPnl
  // itself, so this feature can never change the existing P&L/forecast/break-even output.

  /** Recurring OperatingExpense cost, pro-rated over [from, to) — same math as getPnl. */
  async getOperatingExpensesTotal(storeId: string, from: Date, to: Date): Promise<number> {
    const expenses = await this.activeExpensesForWindow(storeId, from, to);
    return money(expenses.reduce((sum, e) => sum + this.expenseChargeForWindow(e, from, to), 0));
  }

  /** Revenue collected per payment method over [from, to) — used for the Cash Flow card. */
  async getPaymentMethodBreakdown(
    storeId: string,
    from: Date,
    to: Date,
  ): Promise<Record<PaymentMethodType, number>> {
    const rows = await this.prisma.payment.groupBy({
      by: ["method"],
      where: { order: { storeId, orderDate: { gte: from, lt: to }, status: REVENUE_STATUS_FILTER } },
      _sum: { amount: true },
    });
    const result: Record<PaymentMethodType, number> = {
      cash: 0,
      card: 0,
      mobile_wallet: 0,
      bank_transfer: 0,
    };
    for (const row of rows) {
      result[row.method] = money(Number(row._sum.amount ?? 0));
    }
    return result;
  }

  /** Refunds paid out per method over [from, to) — a cash refund removes money from
   * the till just like a cash expense does, so the Cash Flow card needs this to
   * reconcile correctly (refundMethod is null for a pure exchange with no cash out). */
  async getRefundsByMethod(
    storeId: string,
    from: Date,
    to: Date,
  ): Promise<Record<PaymentMethodType, number>> {
    const rows = await this.prisma.salesReturn.groupBy({
      by: ["refundMethod"],
      where: { storeId, returnDate: { gte: from, lt: to }, refundMethod: { not: null } },
      _sum: { refundTotal: true },
    });
    const result: Record<PaymentMethodType, number> = {
      cash: 0,
      card: 0,
      mobile_wallet: 0,
      bank_transfer: 0,
    };
    for (const row of rows) {
      if (!row.refundMethod) continue;
      result[row.refundMethod] = money(Number(row._sum.refundTotal ?? 0));
    }
    return result;
  }
}
