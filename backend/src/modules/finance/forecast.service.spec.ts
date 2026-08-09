import { ForecastService } from "./forecast.service";
import type { DailyPoint, PeriodPnl } from "./finance.service";

function pnl(over: Partial<PeriodPnl> = {}): PeriodPnl {
  return {
    from: "", to: "", days: 90,
    grossRevenue: 0, vatCollected: 0, discountsGiven: 0,
    grossSalesNet: 0, returnsNetValue: 0, returnsTotal: 0, returnCount: 0,
    netRevenue: 0, cogs: 0, grossProfit: 0, grossMarginPct: 40,
    operatingExpenses: 0, expenseBreakdown: [], netProfit: 0, netMarginPct: null,
    orderCount: 0, unitsSold: 0, averageBasket: null, grossProfitPerOrder: null,
    ...over,
  };
}

/** `days` daily points ending today; `revenueAt(i)` gives each day's net revenue. */
function series(days: number, revenueAt: (i: number) => number): DailyPoint[] {
  const out: DailyPoint[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const netRevenue = revenueAt(i);
    out.push({
      date: d.toISOString().slice(0, 10),
      netRevenue,
      cogs: 0,
      grossProfit: netRevenue,
      operatingExpenses: 0,
      netProfit: netRevenue,
    });
  }
  return out;
}

function makeService(opts: {
  series: DailyPoint[];
  history?: Partial<PeriodPnl>;
  inceptionNetProfit?: number;
  monthlyRunRate?: number;
  initialInvestment?: number;
}) {
  const prisma = {
    store: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: "store-1",
        currency: "EGP",
        initialInvestment: opts.initialInvestment ?? 100000,
        financialStartDate: new Date("2026-01-01"),
        openingDate: null,
        createdAt: new Date("2026-01-01"),
      }),
    },
    operatingExpense: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const finance = {
    getDailySeries: jest.fn().mockResolvedValue(opts.series),
    getPnl: jest
      .fn()
      .mockResolvedValueOnce(pnl(opts.history))
      .mockResolvedValueOnce(pnl({ netProfit: opts.inceptionNetProfit ?? 0 })),
    monthlyRunRate: jest.fn().mockReturnValue(opts.monthlyRunRate ?? 5000),
  };
  return { service: new ForecastService(prisma as never, finance as never), prisma, finance };
}

describe("ForecastService", () => {
  it("projects a flat series at its average with no trend", async () => {
    const { service } = makeService({ series: series(60, () => 1000) });
    const r = await service.getForecast("store-1", 3);

    expect(r.basis.averageDailyNetRevenue).toBe(1000);
    expect(r.basis.dailyTrend).toBeCloseTo(0, 6);
    expect(r.basis.trendApplied).toBe(true);
    // ~1000/day across each month, so every month lands near 30k.
    for (const m of r.months) {
      expect(m.projectedNetRevenue).toBeGreaterThan(27000);
      expect(m.projectedNetRevenue).toBeLessThan(32000);
    }
  });

  it("detects growth and projects each month higher than the last", async () => {
    const { service } = makeService({ series: series(60, (i) => 1000 + i * 10) });
    const r = await service.getForecast("store-1", 4);

    expect(r.basis.dailyTrend).toBeGreaterThan(9);
    const revenues = r.months.map((m) => m.projectedNetRevenue);
    for (let i = 1; i < revenues.length; i++) {
      expect(revenues[i]).toBeGreaterThan(revenues[i - 1]);
    }
  });

  it("damps growth so a short ramp-up does not extrapolate into a fantasy", async () => {
    // A steep ramp: undamped, month-on-month growth would stay constant forever.
    const { service } = makeService({ series: series(60, (i) => 500 + i * 25) });
    const r = await service.getForecast("store-1", 6);
    const rev = r.months.map((m) => m.projectedNetRevenue);

    // Still growing...
    expect(rev[5]).toBeGreaterThan(rev[0]);
    // ...but decelerating. Compared as growth *rates*, since raw month-on-month deltas
    // are confounded by calendar length (a 31-day month after a 30-day one lifts the
    // total even while the underlying trend is decaying).
    const earlyRate = rev[1] / rev[0];
    const lateRate = rev[5] / rev[4];
    expect(lateRate).toBeLessThan(earlyRate);
    // And the daily run-rate must not have run away: undamped, +25/day over ~6 months
    // would add ~4,500/day on top of the ~1,240 average.
    const finalDailyRate = rev[5] / 28;
    expect(finalDailyRate).toBeLessThan(1240 + 4500);
  });

  it("never projects negative revenue from a steep decline", async () => {
    // Falls to zero well inside the horizon; extrapolation would otherwise go negative.
    const { service } = makeService({ series: series(60, (i) => Math.max(0, 2000 - i * 30)) });
    const r = await service.getForecast("store-1", 12);

    expect(r.basis.dailyTrend).toBeLessThan(0);
    for (const m of r.months) {
      expect(m.projectedNetRevenue).toBeGreaterThanOrEqual(0);
    }
  });

  it("falls back to a flat average when history is too short for a trend", async () => {
    const { service } = makeService({ series: series(5, () => 500) });
    const r = await service.getForecast("store-1", 3);

    expect(r.basis.trendApplied).toBe(false);
    expect(r.basis.dailyTrend).toBe(0);
    expect(r.basis.confidence).toBe("low");
    expect(r.basis.note).toMatch(/indicative only/);
  });

  it("ignores leading zero days before the shop started trading", async () => {
    // 30 silent days then 30 at 1000 — the average must be 1000, not 500.
    const { service } = makeService({
      series: series(60, (i) => (i < 30 ? 0 : 1000)),
    });
    const r = await service.getForecast("store-1", 1);

    expect(r.basis.daysWithData).toBe(30);
    expect(r.basis.averageDailyNetRevenue).toBe(1000);
  });

  it("applies the real gross margin and fixed cost base to reach net profit", async () => {
    const { service } = makeService({
      series: series(60, () => 1000),
      history: { grossMarginPct: 40 },
      monthlyRunRate: 5000,
    });
    const r = await service.getForecast("store-1", 1);
    const m = r.months[0];

    expect(m.projectedGrossProfit).toBeCloseTo(m.projectedNetRevenue * 0.4, 0);
    expect(m.projectedCogs).toBeCloseTo(m.projectedNetRevenue * 0.6, 0);
    // ~30k revenue x 40% = ~12k gross, less ~5k costs.
    expect(m.projectedNetProfit).toBeGreaterThan(6000);
    expect(m.projectedNetProfit).toBeLessThan(8000);
  });

  it("reports a loss when projected gross profit cannot cover fixed costs", async () => {
    const { service } = makeService({
      series: series(60, () => 100), // ~3k/month
      history: { grossMarginPct: 40 }, // ~1.2k gross
      monthlyRunRate: 5000,
    });
    const r = await service.getForecast("store-1", 2);

    expect(r.months[0].projectedNetProfit).toBeLessThan(0);
    expect(r.summary.firstProfitableMonth).toBeNull();
  });

  it("finds the month the capital is paid back", async () => {
    const { service } = makeService({
      series: series(60, () => 5000),
      history: { grossMarginPct: 50 },
      monthlyRunRate: 5000,
      initialInvestment: 100000,
      inceptionNetProfit: 0,
    });
    const r = await service.getForecast("store-1", 12);

    // ~150k revenue/month x 50% = ~75k gross, less 5k = ~70k/month → payback in month 2.
    expect(r.summary.paybackMonth).toBe(r.months[1].month);
  });

  it("returns no payback month when the projection never covers the investment", async () => {
    const { service } = makeService({
      series: series(60, () => 200),
      history: { grossMarginPct: 40 },
      monthlyRunRate: 5000,
      initialInvestment: 100000,
    });
    const r = await service.getForecast("store-1", 6);

    expect(r.summary.paybackMonth).toBeNull();
  });

  it("handles a store with no sales at all without dividing by zero", async () => {
    const { service } = makeService({
      series: series(30, () => 0),
      history: { grossMarginPct: null },
    });
    const r = await service.getForecast("store-1", 3);

    expect(r.basis.daysWithData).toBe(0);
    expect(r.basis.averageDailyNetRevenue).toBe(0);
    expect(r.months[0].projectedNetRevenue).toBe(0);
    // Still carrying rent with no income.
    expect(r.months[0].projectedNetProfit).toBeLessThan(0);
  });

  it("clamps the horizon to a sane range", async () => {
    const { service } = makeService({ series: series(60, () => 1000) });
    await expect(service.getForecast("store-1", 999)).resolves.toHaveProperty(
      "summary.horizonMonths",
      24,
    );
  });
});
