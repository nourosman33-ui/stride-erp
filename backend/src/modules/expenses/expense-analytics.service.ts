import { Injectable } from "@nestjs/common";
import { PaymentMethodType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { money, MS_PER_DAY } from "../finance/finance.constants";
import { addDays, dayWindow, isoDate, monthWindow, startOfDay, weekWindow, yearWindow } from "./period-windows";
import { isElevated } from "./role-utils";

export interface CategoryBreakdownEntry {
  categoryId: string;
  categoryName: string;
  amount: number;
  count: number;
}

export interface ExpenseWindowAnalytics {
  from: string;
  to: string;
  total: number;
  count: number;
  byCategory: CategoryBreakdownEntry[];
  byPaymentMethod: Record<PaymentMethodType, number>;
  averageDaily: number;
  highestDay: { date: string; amount: number } | null;
  highestCategory: CategoryBreakdownEntry | null;
}

/**
 * Pure DailyExpense-side aggregation — totals, breakdowns, averages, highest
 * day/category, daily series. Only ever sums `status: "approved"` rows
 * (pending/rejected are invisible everywhere except the expense list itself),
 * mirroring how FinanceService excludes voided sales from revenue.
 */
@Injectable()
export class ExpenseAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private approvedRows(storeId: string, from: Date, to: Date, createdById?: string) {
    return this.prisma.dailyExpense.findMany({
      where: {
        storeId,
        status: "approved",
        deletedAt: null,
        occurredAt: { gte: from, lt: to },
        ...(createdById ? { createdById } : {}),
      },
      select: {
        amount: true,
        paymentMethod: true,
        occurredAt: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    });
  }

  async getWindowAnalytics(
    storeId: string,
    from: Date,
    to: Date,
    createdById?: string,
  ): Promise<ExpenseWindowAnalytics> {
    const rows = await this.approvedRows(storeId, from, to, createdById);

    let total = 0;
    const byCategoryMap = new Map<string, CategoryBreakdownEntry>();
    const byPaymentMethod: Record<PaymentMethodType, number> = {
      cash: 0,
      card: 0,
      mobile_wallet: 0,
      bank_transfer: 0,
    };
    const byDayMap = new Map<string, number>();

    for (const row of rows) {
      const amount = Number(row.amount);
      total += amount;
      byPaymentMethod[row.paymentMethod] += amount;

      const existing = byCategoryMap.get(row.categoryId);
      if (existing) {
        existing.amount += amount;
        existing.count += 1;
      } else {
        byCategoryMap.set(row.categoryId, {
          categoryId: row.categoryId,
          categoryName: row.category.name,
          amount,
          count: 1,
        });
      }

      const dayKey = isoDate(startOfDay(row.occurredAt));
      byDayMap.set(dayKey, (byDayMap.get(dayKey) ?? 0) + amount);
    }

    for (const key of Object.keys(byPaymentMethod) as PaymentMethodType[]) {
      byPaymentMethod[key] = money(byPaymentMethod[key]);
    }

    const byCategory = [...byCategoryMap.values()]
      .map((c) => ({ ...c, amount: money(c.amount) }))
      .sort((a, b) => b.amount - a.amount);

    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / MS_PER_DAY));
    const averageDaily = money(total / days);

    let highestDay: { date: string; amount: number } | null = null;
    for (const [date, amount] of byDayMap) {
      if (!highestDay || amount > highestDay.amount) highestDay = { date, amount: money(amount) };
    }

    return {
      from: isoDate(from),
      to: isoDate(addDays(to, -1)),
      total: money(total),
      count: rows.length,
      byCategory,
      byPaymentMethod,
      averageDaily,
      highestDay,
      highestCategory: byCategory.length > 0 ? byCategory[0] : null,
    };
  }

  /** {today, week, month, year} totals for the KPI strip — always store-wide (or
   * scoped to one user for the cashier's own "today" tile), regardless of any
   * filter the UI currently has selected. */
  async getQuickTotals(storeId: string, createdById?: string, now = new Date()) {
    const [today, week, month, year] = await Promise.all([
      this.getWindowTotal(storeId, dayWindow(now), createdById),
      this.getWindowTotal(storeId, weekWindow(now), createdById),
      this.getWindowTotal(storeId, monthWindow(now), createdById),
      this.getWindowTotal(storeId, yearWindow(now), createdById),
    ]);
    return { today, week, month, year };
  }

  private async getWindowTotal(
    storeId: string,
    window: { from: Date; to: Date },
    createdById?: string,
  ): Promise<number> {
    const agg = await this.prisma.dailyExpense.aggregate({
      where: {
        storeId,
        status: "approved",
        deletedAt: null,
        occurredAt: { gte: window.from, lt: window.to },
        ...(createdById ? { createdById } : {}),
      },
      _sum: { amount: true },
    });
    return money(Number(agg._sum.amount ?? 0));
  }

  /** Day-bucketed approved-expense series over [from, to) — for charts. */
  async getDailySeries(storeId: string, from: Date, to: Date): Promise<{ date: string; amount: number }[]> {
    const rows = await this.approvedRows(storeId, from, to);
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const key = isoDate(startOfDay(row.occurredAt));
      byDay.set(key, (byDay.get(key) ?? 0) + Number(row.amount));
    }
    const points: { date: string; amount: number }[] = [];
    for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
      const key = isoDate(d);
      points.push({ date: key, amount: money(byDay.get(key) ?? 0) });
    }
    return points;
  }

  /** Cashier gets their own contribution only; manager/owner get the whole store. */
  scopeFor(requester: AuthenticatedUser): string | undefined {
    return isElevated(requester.roles) ? undefined : requester.userId;
  }
}
