import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { FinancialDashboardService, type ChartGranularity } from "./financial-dashboard.service";

/**
 * Class-level guard defaults to owner-only, matching FinanceController's own
 * posture for the sensitive combined revenue/expense figures. The one route
 * requirement #10 explicitly grants Manager review over — daily-closing —
 * overrides with its own method-level @Roles. Deliberately a distinct route
 * prefix from /finance/* rather than folded into it, so the "Revenue/
 * Expenses/Net Income" (no COGS) figures here never get confused with
 * /finance's COGS-adjusted P&L in code or in the URL.
 */
@Controller("financial-dashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("owner")
export class FinancialDashboardController {
  constructor(private readonly dashboard: FinancialDashboardService) {}

  @Get("kpis")
  getKpis(@Query("storeId") storeId: string) {
    return this.dashboard.getKpis(storeId);
  }

  @Get("charts")
  getCharts(@Query("storeId") storeId: string, @Query("granularity") granularity?: ChartGranularity) {
    return this.dashboard.getCharts(storeId, granularity ?? "daily");
  }

  @Get("custom-range")
  getCustomRange(@Query("storeId") storeId: string, @Query("from") from: string, @Query("to") to: string) {
    const toDate = addOneDay(new Date(to));
    return this.dashboard.getCustomRange(storeId, new Date(from), toDate);
  }

  // Cashier included: this is the end-of-day brief they close the till against.
  // It reports takings, expenses and cash position only — no COGS, margin or
  // capital data, which stay owner-only on the routes above.
  @Get("daily-closing/:date")
  @Roles("owner", "manager", "cashier")
  getDailyClosing(@Param("date") date: string, @Query("storeId") storeId: string) {
    return this.dashboard.getDailyClosing(storeId, new Date(date));
  }

  @Get("monthly-report")
  getMonthlyReport(@Query("storeId") storeId: string, @Query("month") month: string) {
    return this.dashboard.getMonthlyReport(storeId, month);
  }

  @Get("yearly-report")
  getYearlyReport(@Query("storeId") storeId: string, @Query("year") year: string) {
    return this.dashboard.getYearlyReport(storeId, Number(year));
  }
}

function addOneDay(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + 1);
  return x;
}
