import { apiFetch } from "./client";

export type ExpenseCategory =
  | "rent"
  | "utilities"
  | "salaries"
  | "marketing"
  | "logistics"
  | "maintenance"
  | "software"
  | "other";

export type ExpenseFrequency = "one_time" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface OperatingExpense {
  id: string;
  storeId: string;
  category: ExpenseCategory;
  label: string;
  amount: string;
  frequency: ExpenseFrequency;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** All money figures are numbers here — FinanceService rounds server-side. */
export interface PeriodPnl {
  from: string;
  to: string;
  days: number;
  grossRevenue: number;
  vatCollected: number;
  discountsGiven: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number | null;
  operatingExpenses: number;
  expenseBreakdown: { category: ExpenseCategory; label: string; amount: number }[];
  netProfit: number;
  netMarginPct: number | null;
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

export interface FinanceOverview {
  currency: string;
  generatedAt: string;
  periods: {
    daily: PeriodPnl;
    weekly: PeriodPnl;
    monthly: PeriodPnl;
    last30Days: PeriodPnl;
    inceptionToDate: PeriodPnl;
  };
  costBase: {
    expenses: OperatingExpense[];
    dailyFixedCosts: number;
    weeklyFixedCosts: number;
    monthlyFixedCosts: number;
    annualFixedCosts: number;
  };
  planning: {
    initialInvestment: number;
    capitalPosition: number;
    cumulativeNetProfit: number;
    roiPct: number | null;
    paybackMonths: number | null;
    monthlyNetProfitRunRate: number;
    cashRunwayMonths: number | null;
    breakEvenMonthlyRevenue: number | null;
    breakEvenDailyRevenue: number | null;
    breakEvenOrdersPerMonth: number | null;
    marginBasisPct: number | null;
  };
  workingCapital: {
    inventoryValueAtCost: number;
    inventoryTurnover: number | null;
    daysInventoryOutstanding: number | null;
  };
  series: DailyPoint[];
}

export type PeriodKey = keyof FinanceOverview["periods"];

export function getFinanceOverview(storeId: string) {
  return apiFetch<FinanceOverview>("/finance/overview", { params: { storeId } });
}

export function getPnl(storeId: string, from?: string, to?: string) {
  return apiFetch<PeriodPnl>("/finance/pnl", { params: { storeId, from, to } });
}

export function listExpenses(storeId: string) {
  return apiFetch<OperatingExpense[]>("/finance/expenses", { params: { storeId } });
}

export interface CreateExpenseInput {
  storeId: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  frequency: ExpenseFrequency;
  startDate: string;
  endDate?: string;
  notes?: string;
}

export function createExpense(input: CreateExpenseInput) {
  return apiFetch<OperatingExpense>("/finance/expenses", { method: "POST", body: input });
}

export function updateExpense(id: string, input: Partial<Omit<CreateExpenseInput, "storeId">>) {
  return apiFetch<OperatingExpense>(`/finance/expenses/${id}`, { method: "PATCH", body: input });
}

/** Closes the cost (keeps history) rather than deleting it. */
export function closeExpense(id: string) {
  return apiFetch<OperatingExpense>(`/finance/expenses/${id}`, { method: "DELETE" });
}
