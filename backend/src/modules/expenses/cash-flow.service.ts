import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FinanceService } from "../finance/finance.service";
import { money } from "../finance/finance.constants";
import { ExpenseAnalyticsService } from "./expense-analytics.service";
import { ExpensesService } from "./expenses.service";
import { dayWindow, dbDateOnly, isoDate } from "./period-windows";

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
  /** Cash-method pending expenses not yet reflected above — see requirement's ask
   * to explain an apparent mismatch rather than let it read as a real shortage. */
  pendingCashImpact: { count: number; amount: number };
}

/**
 * Daily till reconciliation: Opening Cash + Cash Sales − Cash Refunds − Cash
 * Expenses = Expected Closing Cash, compared against the physically counted
 * amount. Only `openingCash`/`actualClosingCash` are ever stored (on
 * `CashCount`) — everything else is computed live from SalesOrder/Payment/
 * SalesReturn/DailyExpense so it can never go stale (requirement #15).
 */
@Injectable()
export class CashFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly expenseAnalytics: ExpenseAnalyticsService,
    private readonly expenses: ExpensesService,
  ) {}

  async computeCashFlow(storeId: string, date: Date): Promise<CashFlowSummary> {
    const window = dayWindow(date);

    const [cashCount, paymentBreakdown, refundsByMethod, expenseWindow, pendingCash] = await Promise.all([
      this.prisma.cashCount.findUnique({
        where: { storeId_countDate: { storeId, countDate: dbDateOnly(date) } },
        include: { countedBy: { select: { id: true, fullName: true } } },
      }),
      this.finance.getPaymentMethodBreakdown(storeId, window.from, window.to),
      this.finance.getRefundsByMethod(storeId, window.from, window.to),
      this.expenseAnalytics.getWindowAnalytics(storeId, window.from, window.to),
      this.expenses.getPendingSummary(storeId, undefined, "cash"),
    ]);

    const openingCash = cashCount ? Number(cashCount.openingCash) : 0;
    const cashSales = paymentBreakdown.cash;
    const cashRefunds = refundsByMethod.cash;
    const cashExpenses = expenseWindow.byPaymentMethod.cash;
    const expectedClosingCash = money(openingCash + cashSales - cashRefunds - cashExpenses);
    const actualClosingCash = cashCount?.actualClosingCash != null ? Number(cashCount.actualClosingCash) : null;
    const difference = actualClosingCash === null ? null : money(actualClosingCash - expectedClosingCash);

    let status: CashFlowStatus = "not_counted";
    if (difference !== null) {
      status = difference === 0 ? "balanced" : difference > 0 ? "surplus" : "shortage";
    }

    return {
      date: isoDate(window.from),
      openingCash,
      cashSales,
      cashRefunds,
      cashExpenses,
      expectedClosingCash,
      actualClosingCash,
      difference,
      status,
      countedBy: cashCount?.countedBy ?? null,
      countedAt: cashCount?.countedAt?.toISOString() ?? null,
      pendingCashImpact: pendingCash,
    };
  }

  setOpeningCash(storeId: string, date: Date, amount: number, userId: string) {
    const countDate = dbDateOnly(date);
    return this.prisma.cashCount.upsert({
      where: { storeId_countDate: { storeId, countDate } },
      update: { openingCash: amount },
      create: { storeId, countDate, openingCash: amount, createdById: userId },
    });
  }

  recordActualClosing(storeId: string, date: Date, amount: number, userId: string) {
    const countDate = dbDateOnly(date);
    return this.prisma.cashCount.upsert({
      where: { storeId_countDate: { storeId, countDate } },
      update: { actualClosingCash: amount, countedById: userId, countedAt: new Date() },
      create: {
        storeId,
        countDate,
        actualClosingCash: amount,
        countedById: userId,
        countedAt: new Date(),
        createdById: userId,
      },
    });
  }

  listHistory(storeId: string, from: Date, to: Date) {
    return this.prisma.cashCount.findMany({
      where: { storeId, countDate: { gte: dbDateOnly(from), lt: dbDateOnly(to) } },
      include: {
        countedBy: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { countDate: "desc" },
    });
  }
}
