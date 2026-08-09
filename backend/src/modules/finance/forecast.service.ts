import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FinanceService } from "./finance.service";
import { DAYS_PER_MONTH, money, pct } from "./finance.constants";

/** Below this, a trend line is noise rather than signal — we fall back to a flat average. */
const MIN_DAYS_FOR_TREND = 14;
/** History window the projection is fitted to. */
const LOOKBACK_DAYS = 90;
/**
 * Per-month damping on the trend (Holt's damped-trend idea, simplified). An undamped
 * linear trend fitted to a few weeks of a shop ramping up compounds absurdly — it will
 * happily claim revenue doubles every quarter, forever. Damping lets early growth show
 * while flattening the curve out, so month 6 is a projection rather than a fantasy.
 * At 0.85, the trend contributes ~44% by month 5 and ~20% by month 10.
 */
const TREND_DAMPING = 0.85;

export interface ForecastMonth {
  month: string; // YYYY-MM
  label: string;
  projectedNetRevenue: number;
  projectedCogs: number;
  projectedGrossProfit: number;
  projectedOperatingCosts: number;
  projectedNetProfit: number;
  cumulativeNetProfit: number;
  /** Cumulative profit measured against the owner's capital — crosses 0 at payback. */
  cumulativeVsInvestment: number;
}

export interface ForecastResult {
  currency: string;
  generatedAt: string;
  basis: {
    lookbackDays: number;
    daysWithData: number;
    averageDailyNetRevenue: number;
    /** Currency change in daily revenue per day. Positive = growing. */
    dailyTrend: number;
    trendApplied: boolean;
    grossMarginPct: number | null;
    monthlyFixedCosts: number;
    confidence: "low" | "medium";
    note: string;
  };
  months: ForecastMonth[];
  summary: {
    horizonMonths: number;
    totalProjectedNetRevenue: number;
    totalProjectedNetProfit: number;
    /** First month whose cumulative profit covers the initial investment. */
    paybackMonth: string | null;
    /** First month projected to turn a profit, if not already profitable. */
    firstProfitableMonth: string | null;
    initialInvestment: number;
  };
}

/**
 * Deliberately simple and explainable: a trailing daily average with a least-squares
 * trend, projected forward and run through the *actual* gross margin and the *actual*
 * declared cost base. It is an arithmetic extrapolation, not a statistical model — no
 * seasonality, no promotions, no competitor effects. A few weeks of shop history cannot
 * know that Ramadan or back-to-school exists, so the output is always labelled an
 * estimate and its confidence is capped at "medium".
 */
@Injectable()
export class ForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  /** Least-squares slope of y over x=0..n-1. Returns change per step. */
  private linearSlope(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;
    const meanX = (n - 1) / 2;
    const meanY = values.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - meanX) * (values[i] - meanY);
      den += (i - meanX) ** 2;
    }
    return den === 0 ? 0 : num / den;
  }

  async getForecast(storeId: string, horizonMonths = 6): Promise<ForecastResult> {
    const horizon = Math.min(24, Math.max(1, horizonMonths));

    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today);
    from.setDate(from.getDate() - (LOOKBACK_DAYS - 1));
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [series, history, expenses, inception] = await Promise.all([
      this.finance.getDailySeries(storeId, from, tomorrow),
      this.finance.getPnl(storeId, from, tomorrow),
      this.prisma.operatingExpense.findMany({ where: { storeId } }),
      this.finance.getPnl(
        storeId,
        new Date(store.financialStartDate ?? store.openingDate ?? store.createdAt),
        tomorrow,
      ),
    ]);

    // Only count days from the first day that actually saw a sale — leading zeros from
    // before the shop opened would drag the average down and invent a fake downtrend.
    const firstSaleIdx = series.findIndex((p) => p.netRevenue > 0);
    const active = firstSaleIdx === -1 ? [] : series.slice(firstSaleIdx);
    const daysWithData = active.length;

    const revenues = active.map((p) => p.netRevenue);
    const averageDailyNetRevenue =
      daysWithData > 0 ? revenues.reduce((a, b) => a + b, 0) / daysWithData : 0;

    const trendApplied = daysWithData >= MIN_DAYS_FOR_TREND;
    const dailyTrend = trendApplied ? this.linearSlope(revenues) : 0;

    const grossMarginPct = history.grossMarginPct;
    const marginRatio = grossMarginPct === null ? 0 : grossMarginPct / 100;
    const monthlyFixedCosts = this.finance.monthlyRunRate(expenses);

    const months: ForecastMonth[] = [];
    let cumulative = 0;
    // Running daily rate, carried across months so growth compounds smoothly rather than
    // resetting each month.
    let dailyLevel = averageDailyNetRevenue;

    for (let m = 0; m < horizon; m++) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() + m + 1, 1);
      const daysInMonth = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth() + 1,
        0,
      ).getDate();

      // The trend's influence decays each month (see TREND_DAMPING). Revenue is floored
      // at zero: a downward trend extrapolates to negative revenue, which is arithmetic,
      // not reality.
      const damping = Math.pow(TREND_DAMPING, m);
      let monthRevenue = 0;
      for (let d = 0; d < daysInMonth; d++) {
        dailyLevel += dailyTrend * damping;
        monthRevenue += Math.max(0, dailyLevel);
      }
      monthRevenue = money(monthRevenue);

      const grossProfit = money(monthRevenue * marginRatio);
      const cogs = money(monthRevenue - grossProfit);
      // Fixed costs scale by month length, matching how FinanceService charges them.
      const opex = money((monthlyFixedCosts / DAYS_PER_MONTH) * daysInMonth);
      const netProfit = money(grossProfit - opex);
      cumulative = money(cumulative + netProfit);

      months.push({
        month: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`,
        label: monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        projectedNetRevenue: monthRevenue,
        projectedCogs: cogs,
        projectedGrossProfit: grossProfit,
        projectedOperatingCosts: opex,
        projectedNetProfit: netProfit,
        cumulativeNetProfit: cumulative,
        cumulativeVsInvestment: money(inception.netProfit + cumulative - Number(store.initialInvestment)),
      });
    }

    const initialInvestment = Number(store.initialInvestment);
    const paybackMonth =
      months.find((m) => inception.netProfit + m.cumulativeNetProfit >= initialInvestment)?.month ??
      null;
    const firstProfitableMonth = months.find((m) => m.projectedNetProfit > 0)?.month ?? null;

    return {
      currency: store.currency,
      generatedAt: new Date().toISOString(),
      basis: {
        lookbackDays: LOOKBACK_DAYS,
        daysWithData,
        averageDailyNetRevenue: money(averageDailyNetRevenue),
        dailyTrend: money(dailyTrend),
        trendApplied,
        grossMarginPct,
        monthlyFixedCosts,
        // Never "high": this is extrapolation from a short window with no seasonality.
        confidence: daysWithData >= 60 ? "medium" : "low",
        note: trendApplied
          ? `Projected from ${daysWithData} days of trading using the average daily revenue and a damped trend (growth is assumed to flatten, not continue indefinitely). Excludes seasonality, promotions and one-off events.`
          : `Only ${daysWithData} days of trading available — projected from a flat average with no trend. Treat as indicative only.`,
      },
      months,
      summary: {
        horizonMonths: horizon,
        totalProjectedNetRevenue: money(
          months.reduce((s, m) => s + m.projectedNetRevenue, 0),
        ),
        totalProjectedNetProfit: money(months.reduce((s, m) => s + m.projectedNetProfit, 0)),
        paybackMonth,
        firstProfitableMonth,
        initialInvestment: money(initialInvestment),
      },
    };
  }

  /** Margin of the projection vs the break-even revenue it must clear. */
  breakEvenHeadroomPct(monthRevenue: number, monthlyFixedCosts: number, marginPct: number | null) {
    if (!marginPct || marginPct <= 0) return null;
    const breakEven = monthlyFixedCosts / (marginPct / 100);
    return pct(monthRevenue - breakEven, breakEven);
  }
}
