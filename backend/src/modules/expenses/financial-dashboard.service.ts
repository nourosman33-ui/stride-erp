import { Injectable } from "@nestjs/common";
import { PaymentMethodType } from "@prisma/client";
import { FinanceService } from "../finance/finance.service";
import { money, pct } from "../finance/finance.constants";
import { ExpenseAnalyticsService, type CategoryBreakdownEntry } from "./expense-analytics.service";
import { ExpensesService } from "./expenses.service";
import { CashFlowService, type CashFlowSummary } from "./cash-flow.service";
import {
  addDays,
  dayWindow,
  isoDate,
  monthKeyOf,
  monthWindow,
  startOfDay,
  weekKeyOf,
  yearKeyOf,
  yearWindow,
} from "./period-windows";

export interface CombinedTotals {
  from: string;
  to: string;
  revenue: number;
  expenses: number;
  netIncome: number;
  expenseRatioPct: number | null;
  orderCount: number;
  averageTransactionValue: number | null;
}

export interface DashboardKpis {
  today: CombinedTotals;
  month: CombinedTotals;
  year: CombinedTotals;
  averageDailyRevenue: number;
  averageDailyExpenses: number;
}

export type ChartGranularity = "daily" | "weekly" | "monthly" | "yearly";

export interface DashboardSeriesPoint {
  label: string;
  revenue: number;
  expenses: number;
  netIncome: number;
}

export interface DashboardCharts {
  granularity: ChartGranularity;
  series: DashboardSeriesPoint[];
  expensesByCategory: CategoryBreakdownEntry[];
  paymentMethodBreakdown: Record<PaymentMethodType, number>;
}

export interface DailyClosingSummary {
  date: string;
  totalSales: number;
  cashSales: number;
  cardSales: number;
  otherPaymentSales: number;
  totalExpenses: number;
  cashExpenses: number;
  netIncome: number;
  transactionCount: number;
  expectedClosingCash: number;
  actualClosingCash: number | null;
  cashDifference: number | null;
  cashStatus: CashFlowSummary["status"];
  pendingExpenses: { count: number; amount: number };
}

export interface MonthlyReport {
  month: string;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  expenseRatioPct: number | null;
  transactionCount: number;
  averageTransactionValue: number | null;
  topExpenseCategories: CategoryBreakdownEntry[];
  bestSalesDay: { date: string; amount: number } | null;
  highestExpenseDay: { date: string; amount: number } | null;
}

export interface YearlyReport {
  year: number;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  monthlyComparison: DashboardSeriesPoint[];
  bestMonth: DashboardSeriesPoint | null;
  worstMonth: DashboardSeriesPoint | null;
}

/**
 * Combines FinanceService (revenue/sales side) with ExpenseAnalyticsService
 * (ad-hoc DailyExpense side) into the Owner Financial Dashboard's numbers.
 * "Revenue" here is FinanceService.getPnl's `netRevenue` (actual sales after
 * returns, before VAT) — a plain, recognizable "sales total," not the
 * COGS-adjusted `netProfit` the existing /financials P&L already shows.
 * "Net Income" = Revenue − (DailyExpense approved + OperatingExpense
 * pro-rated) — deliberately NOT COGS-adjusted, so it stays a distinct,
 * clearly-labeled figure from the existing "Net Profit" (see requirement #12:
 * keep Revenue/Expenses/Net Income separate from any future COGS layer).
 */
@Injectable()
export class FinancialDashboardService {
  constructor(
    private readonly finance: FinanceService,
    private readonly expenseAnalytics: ExpenseAnalyticsService,
    private readonly cashFlow: CashFlowService,
    private readonly expenses: ExpensesService,
  ) {}

  private async combinedTotals(storeId: string, from: Date, to: Date): Promise<CombinedTotals> {
    const [pnl, adHocExpenses, operatingExpenses] = await Promise.all([
      this.finance.getPnl(storeId, from, to),
      this.expenseAnalytics.getWindowAnalytics(storeId, from, to),
      this.finance.getOperatingExpensesTotal(storeId, from, to),
    ]);

    const revenue = pnl.netRevenue;
    const expenses = money(adHocExpenses.total + operatingExpenses);
    const netIncome = money(revenue - expenses);

    return {
      from: isoDate(from),
      to: isoDate(addDays(to, -1)),
      revenue,
      expenses,
      netIncome,
      expenseRatioPct: pct(expenses, revenue),
      orderCount: pnl.orderCount,
      averageTransactionValue: pnl.averageBasket,
    };
  }

  async getKpis(storeId: string, now = new Date()): Promise<DashboardKpis> {
    const today = dayWindow(now);
    const month = monthWindow(now);
    const year = yearWindow(now);

    const [todayTotals, monthTotals, yearTotals] = await Promise.all([
      this.combinedTotals(storeId, today.from, today.to),
      this.combinedTotals(storeId, month.from, month.to),
      this.combinedTotals(storeId, year.from, year.to),
    ]);

    const daysThisMonth = Math.max(
      1,
      Math.round((month.to.getTime() - month.from.getTime()) / (24 * 60 * 60 * 1000)),
    );

    return {
      today: todayTotals,
      month: monthTotals,
      year: yearTotals,
      averageDailyRevenue: money(monthTotals.revenue / daysThisMonth),
      averageDailyExpenses: money(monthTotals.expenses / daysThisMonth),
    };
  }

  /** Combined revenue/expenses/netIncome for an arbitrary custom range (req #4). */
  getCustomRange(storeId: string, from: Date, to: Date): Promise<CombinedTotals> {
    return this.combinedTotals(storeId, from, to);
  }

  async getCharts(storeId: string, granularity: ChartGranularity, now = new Date()): Promise<DashboardCharts> {
    let windowFrom: Date;
    const windowTo = addDays(startOfDay(now), 1);

    switch (granularity) {
      case "daily":
        windowFrom = addDays(startOfDay(now), -29); // last 30 days
        break;
      case "weekly":
        windowFrom = addDays(startOfDay(now), -7 * 11); // last 12 weeks
        break;
      case "monthly":
        windowFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1); // last 12 months
        break;
      case "yearly":
        windowFrom = new Date(now.getFullYear() - 4, 0, 1); // last 5 years
        break;
    }

    const [dailyPoints, expenseWindow, paymentMethodBreakdown] = await Promise.all([
      this.mergedDailyPoints(storeId, windowFrom, windowTo),
      this.expenseAnalytics.getWindowAnalytics(storeId, windowFrom, windowTo),
      this.finance.getPaymentMethodBreakdown(storeId, windowFrom, windowTo),
    ]);

    const series = this.bucketSeries(dailyPoints, granularity);

    return {
      granularity,
      series,
      expensesByCategory: expenseWindow.byCategory,
      paymentMethodBreakdown,
    };
  }

  /** Day-by-day {revenue, expenses, netIncome} — revenue side from FinanceService,
   * expenses = recurring OperatingExpense (pro-rated) + ad-hoc DailyExpense, merged
   * so every chart/report in this module agrees with the KPI cards' combined total. */
  private async mergedDailyPoints(storeId: string, from: Date, to: Date): Promise<DashboardSeriesPoint[]> {
    const [revenueSeries, expenseSeries] = await Promise.all([
      this.finance.getDailySeries(storeId, from, to),
      this.expenseAnalytics.getDailySeries(storeId, from, to),
    ]);
    const opexByDay = new Map(revenueSeries.map((p) => [p.date, p.operatingExpenses]));
    const adHocByDay = new Map(expenseSeries.map((p) => [p.date, p.amount]));
    return revenueSeries.map((p) => {
      const expenses = money((opexByDay.get(p.date) ?? 0) + (adHocByDay.get(p.date) ?? 0));
      return { label: p.date, revenue: p.netRevenue, expenses, netIncome: money(p.netRevenue - expenses) };
    });
  }

  private bucketSeries(daily: DashboardSeriesPoint[], granularity: ChartGranularity): DashboardSeriesPoint[] {
    if (granularity === "daily") return daily;

    const keyOf = (dateStr: string) => {
      const d = new Date(`${dateStr}T00:00:00`);
      if (granularity === "weekly") return weekKeyOf(d);
      if (granularity === "monthly") return monthKeyOf(d);
      return yearKeyOf(d);
    };

    const buckets = new Map<string, DashboardSeriesPoint>();
    for (const point of daily) {
      const key = keyOf(point.label);
      const existing = buckets.get(key) ?? { label: key, revenue: 0, expenses: 0, netIncome: 0 };
      existing.revenue = money(existing.revenue + point.revenue);
      existing.expenses = money(existing.expenses + point.expenses);
      existing.netIncome = money(existing.netIncome + point.netIncome);
      buckets.set(key, existing);
    }
    return [...buckets.values()].sort((a, b) => (a.label < b.label ? -1 : 1));
  }

  /** Requirement #10 — computed on demand, nothing persisted. */
  async getDailyClosing(storeId: string, date: Date): Promise<DailyClosingSummary> {
    const window = dayWindow(date);
    const [pnl, paymentBreakdown, expenseWindow, operatingExpenses, flow, pending] = await Promise.all([
      this.finance.getPnl(storeId, window.from, window.to),
      this.finance.getPaymentMethodBreakdown(storeId, window.from, window.to),
      this.expenseAnalytics.getWindowAnalytics(storeId, window.from, window.to),
      this.finance.getOperatingExpensesTotal(storeId, window.from, window.to),
      this.cashFlow.computeCashFlow(storeId, date),
      this.expenses.getPendingSummary(storeId),
    ]);

    const totalExpenses = money(expenseWindow.total + operatingExpenses);

    return {
      date: isoDate(window.from),
      totalSales: pnl.netRevenue,
      cashSales: paymentBreakdown.cash,
      cardSales: paymentBreakdown.card,
      otherPaymentSales: money(paymentBreakdown.mobile_wallet + paymentBreakdown.bank_transfer),
      totalExpenses,
      cashExpenses: expenseWindow.byPaymentMethod.cash,
      netIncome: money(pnl.netRevenue - totalExpenses),
      transactionCount: pnl.orderCount,
      expectedClosingCash: flow.expectedClosingCash,
      actualClosingCash: flow.actualClosingCash,
      cashDifference: flow.difference,
      cashStatus: flow.status,
      pendingExpenses: pending,
    };
  }

  /** Requirement #11 (monthly). `month` is "YYYY-MM". */
  async getMonthlyReport(storeId: string, month: string): Promise<MonthlyReport> {
    const [year, m] = month.split("-").map(Number);
    const from = new Date(year, m - 1, 1);
    const to = new Date(year, m, 1);

    const [totals, expenseWindow, revenueSeries] = await Promise.all([
      this.combinedTotals(storeId, from, to),
      this.expenseAnalytics.getWindowAnalytics(storeId, from, to),
      this.finance.getDailySeries(storeId, from, to),
    ]);

    let bestSalesDay: { date: string; amount: number } | null = null;
    for (const p of revenueSeries) {
      if (!bestSalesDay || p.netRevenue > bestSalesDay.amount) {
        bestSalesDay = { date: p.date, amount: money(p.netRevenue) };
      }
    }

    return {
      month,
      totalRevenue: totals.revenue,
      totalExpenses: totals.expenses,
      netIncome: totals.netIncome,
      expenseRatioPct: totals.expenseRatioPct,
      transactionCount: totals.orderCount,
      averageTransactionValue: totals.averageTransactionValue,
      topExpenseCategories: expenseWindow.byCategory.slice(0, 5),
      bestSalesDay,
      highestExpenseDay: expenseWindow.highestDay,
    };
  }

  /** Requirement #11 (yearly). */
  async getYearlyReport(storeId: string, year: number): Promise<YearlyReport> {
    const from = new Date(year, 0, 1);
    const to = new Date(year + 1, 0, 1);

    const [totals, dailyPoints] = await Promise.all([
      this.combinedTotals(storeId, from, to),
      this.mergedDailyPoints(storeId, from, to),
    ]);

    const monthlyComparison = this.bucketSeries(dailyPoints, "monthly");

    let bestMonth: DashboardSeriesPoint | null = null;
    let worstMonth: DashboardSeriesPoint | null = null;
    for (const m of monthlyComparison) {
      if (!bestMonth || m.netIncome > bestMonth.netIncome) bestMonth = m;
      if (!worstMonth || m.netIncome < worstMonth.netIncome) worstMonth = m;
    }

    return {
      year,
      totalRevenue: totals.revenue,
      totalExpenses: totals.expenses,
      netIncome: totals.netIncome,
      monthlyComparison,
      bestMonth,
      worstMonth,
    };
  }
}
