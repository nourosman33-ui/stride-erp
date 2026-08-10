"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banknote, Receipt, TrendingDown, TrendingUp } from "lucide-react";

import {
  getDashboardCharts,
  getDashboardKpis,
  type ChartGranularity,
} from "@/lib/api/financial-dashboard";
import { listExpenses, type DailyExpense } from "@/lib/api/expenses";
import { listSales } from "@/lib/api/sales";
import type { SalesOrder } from "@/lib/api/types";
import { useLocale, type TranslationKey } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { CATEGORICAL, CHART_INK, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE, STATUS } from "@/lib/chart-colors";
import { SalesOrderStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const GRANULARITIES: { key: ChartGranularity; labelKey: TranslationKey }[] = [
  { key: "daily", labelKey: "financials.granularityDaily" },
  { key: "weekly", labelKey: "financials.granularityWeekly" },
  { key: "monthly", labelKey: "financials.granularityMonthly" },
  { key: "yearly", labelKey: "financials.granularityYearly" },
];

function BigKpiCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <Card className="overflow-hidden border-2">
      <CardContent className="space-y-2 pt-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <Icon
            className={`size-5 ${
              tone === "positive" ? "text-success" : tone === "negative" ? "text-destructive" : "text-muted-foreground"
            }`}
          />
        </div>
        <p
          className={`text-3xl font-bold tabular-nums ${
            tone === "positive" ? "text-success" : tone === "negative" ? "text-destructive" : ""
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function ComparisonRow({ label, today, month, year, currency, isPct }: {
  label: string;
  today: number | null;
  month: number | null;
  year: number | null;
  currency: string;
  isPct?: boolean;
}) {
  const fmt = (v: number | null) => (v === null ? "—" : isPct ? `${v.toFixed(1)}%` : formatMoney(v, currency));
  return (
    <div className="grid grid-cols-4 gap-2 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end tabular-nums">{fmt(today)}</span>
      <span className="text-end tabular-nums">{fmt(month)}</span>
      <span className="text-end tabular-nums">{fmt(year)}</span>
    </div>
  );
}

export function FinancialDashboardSection({ storeId, currency }: { storeId: string; currency: string }) {
  const { t } = useLocale();
  const [granularity, setGranularity] = React.useState<ChartGranularity>("daily");

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ["financial-dashboard", "kpis", storeId],
    queryFn: () => getDashboardKpis(storeId),
  });

  const { data: charts, isLoading: chartsLoading } = useQuery({
    queryKey: ["financial-dashboard", "charts", storeId, granularity],
    queryFn: () => getDashboardCharts(storeId, granularity),
  });

  const { data: recentExpenses } = useQuery({
    queryKey: ["expenses", "recent", storeId],
    queryFn: () => listExpenses({ storeId, period: "month", status: "approved" }),
  });

  const { data: recentSales } = useQuery({
    queryKey: ["sales", "recent", storeId],
    queryFn: () => listSales(storeId),
  });

  const recentExpenseItems: DailyExpense[] = (recentExpenses?.items ?? []).slice(0, 5);
  const recentSaleItems: SalesOrder[] = React.useMemo(
    () => [...(recentSales ?? [])].sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1)).slice(0, 5),
    [recentSales],
  );

  if (kpisLoading || !kpis) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const netIncomeTone = kpis.today.netIncome >= 0 ? "positive" : "negative";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("financials.dashboardTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("financials.netIncomeNote")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BigKpiCard label={t("financials.kpiRevenue")} value={formatMoney(kpis.today.revenue, currency)} icon={Banknote} />
        <BigKpiCard
          label={t("financials.kpiExpenses")}
          value={formatMoney(kpis.today.expenses, currency)}
          icon={TrendingDown}
        />
        <BigKpiCard
          label={t("financials.kpiNetIncome")}
          value={formatMoney(kpis.today.netIncome, currency)}
          icon={kpis.today.netIncome >= 0 ? TrendingUp : TrendingDown}
          tone={netIncomeTone}
        />
        <BigKpiCard
          label={t("financials.kpiTransactions")}
          value={formatNumber(kpis.today.orderCount)}
          icon={Receipt}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("financials.comparisonTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 border-b pb-2 text-xs font-medium text-muted-foreground">
            <span />
            <span className="text-end">{t("financials.kpiToday")}</span>
            <span className="text-end">{t("financials.kpiMonthly")}</span>
            <span className="text-end">{t("financials.kpiYearly")}</span>
          </div>
          <ComparisonRow
            label={t("financials.kpiRevenue")}
            today={kpis.today.revenue}
            month={kpis.month.revenue}
            year={kpis.year.revenue}
            currency={currency}
          />
          <ComparisonRow
            label={t("financials.kpiExpenses")}
            today={kpis.today.expenses}
            month={kpis.month.expenses}
            year={kpis.year.expenses}
            currency={currency}
          />
          <ComparisonRow
            label={t("financials.kpiNetIncome")}
            today={kpis.today.netIncome}
            month={kpis.month.netIncome}
            year={kpis.year.netIncome}
            currency={currency}
          />
          <ComparisonRow
            label={t("financials.expenseRatio")}
            today={kpis.today.expenseRatioPct}
            month={kpis.month.expenseRatioPct}
            year={kpis.year.expenseRatioPct}
            currency={currency}
            isPct
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("financials.kpiAvgTransaction")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {kpis.month.averageTransactionValue === null ? "—" : formatMoney(kpis.month.averageTransactionValue, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("financials.kpiAvgDailyRevenue")}</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(kpis.averageDailyRevenue, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("financials.kpiAvgDailyExpenses")}</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(kpis.averageDailyExpenses, currency)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {GRANULARITIES.map((g) => (
          <Button
            key={g.key}
            size="sm"
            variant={granularity === g.key ? "default" : "outline"}
            onClick={() => setGranularity(g.key)}
          >
            {t(g.labelKey)}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("financials.chartRevenueVsExpenses")}</CardTitle>
          </CardHeader>
          <CardContent>
            {chartsLoading || !charts ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={charts.series} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} stroke={CHART_INK.gridline} />
                  <XAxis dataKey="label" stroke={CHART_INK.muted} fontSize={11} />
                  <YAxis stroke={CHART_INK.muted} fontSize={11} width={64} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    formatter={(value) => formatMoney(Number(value ?? 0), currency)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name={t("financials.kpiRevenue")} fill={STATUS.good} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expenses" name={t("financials.kpiExpenses")} fill={STATUS.critical} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("financials.chartNetIncome")}</CardTitle>
          </CardHeader>
          <CardContent>
            {chartsLoading || !charts ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={charts.series} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} stroke={CHART_INK.gridline} />
                  <XAxis dataKey="label" stroke={CHART_INK.muted} fontSize={11} />
                  <YAxis stroke={CHART_INK.muted} fontSize={11} width={64} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    formatter={(value) => formatMoney(Number(value ?? 0), currency)}
                  />
                  <Line
                    type="monotone"
                    dataKey="netIncome"
                    name={t("financials.kpiNetIncome")}
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("financials.chartExpensesByCategory")}</CardTitle>
          </CardHeader>
          <CardContent>
            {chartsLoading || !charts ? (
              <Skeleton className="h-64 w-full" />
            ) : charts.expensesByCategory.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">{t("expenses.noExpenses")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={charts.expensesByCategory}
                    dataKey="amount"
                    nameKey="categoryName"
                    innerRadius={50}
                    outerRadius={90}
                  >
                    {charts.expensesByCategory.map((_, i) => (
                      <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    formatter={(value) => formatMoney(Number(value ?? 0), currency)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("financials.chartPaymentMethodBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            {chartsLoading || !charts ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={Object.entries(charts.paymentMethodBreakdown)
                      .filter(([, v]) => v > 0)
                      .map(([method, amount]) => ({ method, amount }))}
                    dataKey="amount"
                    nameKey="method"
                    innerRadius={50}
                    outerRadius={90}
                  >
                    {Object.entries(charts.paymentMethodBreakdown)
                      .filter(([, v]) => v > 0)
                      .map((_, i) => (
                        <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
                      ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    formatter={(value) => formatMoney(Number(value ?? 0), currency)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("financials.recentExpenses")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentExpenseItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("expenses.noExpenses")}</p>
            ) : (
              recentExpenseItems.map((e) => (
                <div key={e.id} className="flex items-center justify-between border-b py-1.5 text-sm last:border-0">
                  <div>
                    <p className="font-medium">{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.category.name} · {formatDateTime(e.occurredAt)}
                    </p>
                  </div>
                  <span className="tabular-nums text-destructive">-{formatMoney(e.amount, currency)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("financials.recentTransactions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentSaleItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("salesHistory.noSales")}</p>
            ) : (
              recentSaleItems.map((o) => (
                <div key={o.id} className="flex items-center justify-between border-b py-1.5 text-sm last:border-0">
                  <div>
                    <p className="font-mono text-xs">{o.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(o.orderDate)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {o.status !== "completed" && <SalesOrderStatusBadge status={o.status} />}
                    <span className="tabular-nums text-success">+{formatMoney(o.grandTotal, currency)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
