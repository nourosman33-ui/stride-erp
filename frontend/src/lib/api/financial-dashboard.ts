import { apiFetch } from "./client";
import type { PaymentMethodType } from "./types";
import type { CategoryBreakdownEntry } from "./expenses";

export type ChartGranularity = "daily" | "weekly" | "monthly" | "yearly";

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

export function getDashboardKpis(storeId: string) {
  return apiFetch<DashboardKpis>("/financial-dashboard/kpis", { params: { storeId } });
}

export function getDashboardCharts(storeId: string, granularity: ChartGranularity) {
  return apiFetch<DashboardCharts>("/financial-dashboard/charts", { params: { storeId, granularity } });
}

export function getDashboardCustomRange(storeId: string, from: string, to: string) {
  return apiFetch<CombinedTotals>("/financial-dashboard/custom-range", { params: { storeId, from, to } });
}

export type CashFlowStatus = "balanced" | "shortage" | "surplus" | "not_counted";

export interface CashFlowSummary {
  date: string;
  openingCash: number;
  cashSales: number;
  cashRefunds: number;
  cashExpenses: number;
  expectedClosingCash: number;
  actualClosingCash: number | null;
  difference: number | null;
  status: CashFlowStatus;
  countedBy: { id: string; fullName: string } | null;
  countedAt: string | null;
  pendingCashImpact: { count: number; amount: number };
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
  cashStatus: CashFlowStatus;
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

export function getCashFlow(storeId: string, date: string) {
  return apiFetch<CashFlowSummary>(`/cash-counts/${date}`, { params: { storeId } });
}

export function setOpeningCash(storeId: string, date: string, amount: number) {
  return apiFetch(`/cash-counts/${date}/opening`, { method: "PUT", body: { storeId, amount } });
}

export function recordActualClosingCash(storeId: string, date: string, amount: number) {
  return apiFetch(`/cash-counts/${date}/count`, { method: "PUT", body: { storeId, amount } });
}

export function getDailyClosing(storeId: string, date: string) {
  return apiFetch<DailyClosingSummary>(`/financial-dashboard/daily-closing/${date}`, { params: { storeId } });
}

export function getMonthlyReport(storeId: string, month: string) {
  return apiFetch<MonthlyReport>("/financial-dashboard/monthly-report", { params: { storeId, month } });
}

export function getYearlyReport(storeId: string, year: number) {
  return apiFetch<YearlyReport>("/financial-dashboard/yearly-report", { params: { storeId, year } });
}
