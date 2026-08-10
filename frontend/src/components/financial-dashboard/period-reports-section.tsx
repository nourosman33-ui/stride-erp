"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, TrendingDown } from "lucide-react";

import { getMonthlyReport, getYearlyReport } from "@/lib/api/financial-dashboard";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatMoney, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportMenuButton } from "@/components/export-menu-button";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function PeriodReportsSection({ storeId, currency }: { storeId: string; currency: string }) {
  const { t } = useLocale();
  const [mode, setMode] = React.useState<"monthly" | "yearly">("monthly");
  const month = currentMonth();
  const year = new Date().getFullYear();

  const { data: monthly, isLoading: monthlyLoading } = useQuery({
    queryKey: ["financial-dashboard", "monthly-report", storeId, month],
    queryFn: () => getMonthlyReport(storeId, month),
    enabled: mode === "monthly",
  });

  const { data: yearly, isLoading: yearlyLoading } = useQuery({
    queryKey: ["financial-dashboard", "yearly-report", storeId, year],
    queryFn: () => getYearlyReport(storeId, year),
    enabled: mode === "yearly",
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {mode === "monthly" ? t("financials.monthlyReportTitle") : t("financials.yearlyReportTitle")}
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant={mode === "monthly" ? "default" : "outline"} onClick={() => setMode("monthly")}>
            {t("financials.granularityMonthly")}
          </Button>
          <Button size="sm" variant={mode === "yearly" ? "default" : "outline"} onClick={() => setMode("yearly")}>
            {t("financials.granularityYearly")}
          </Button>
          <ExportMenuButton
            kind="financials"
            storeId={storeId}
            formats={["pdf"]}
            label={t("exports.exportFinancialReport")}
            path={() => `/export/financial-report.pdf`}
            params={{ period: mode, key: mode === "monthly" ? month : String(year) }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "monthly" ? (
          monthlyLoading || !monthly ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <StatLine label={t("financials.kpiRevenue")} value={formatMoney(monthly.totalRevenue, currency)} />
                <StatLine label={t("financials.kpiExpenses")} value={formatMoney(monthly.totalExpenses, currency)} />
                <StatLine label={t("financials.kpiNetIncome")} value={formatMoney(monthly.netIncome, currency)} />
                <StatLine
                  label={t("financials.expenseRatio")}
                  value={monthly.expenseRatioPct === null ? "—" : `${monthly.expenseRatioPct.toFixed(1)}%`}
                />
                <StatLine label={t("financials.kpiTransactions")} value={formatNumber(monthly.transactionCount)} />
                <StatLine
                  label={t("financials.kpiAvgTransaction")}
                  value={monthly.averageTransactionValue === null ? "—" : formatMoney(monthly.averageTransactionValue, currency)}
                />
              </div>
              <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <Trophy className="size-4 text-success" />
                  <span className="text-muted-foreground">{t("financials.bestSalesDay")}:</span>
                  <span className="font-medium">
                    {monthly.bestSalesDay ? `${monthly.bestSalesDay.date} (${formatMoney(monthly.bestSalesDay.amount, currency)})` : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingDown className="size-4 text-destructive" />
                  <span className="text-muted-foreground">{t("financials.highestExpenseDay")}:</span>
                  <span className="font-medium">
                    {monthly.highestExpenseDay
                      ? `${monthly.highestExpenseDay.date} (${formatMoney(monthly.highestExpenseDay.amount, currency)})`
                      : "—"}
                  </span>
                </div>
              </div>
              {monthly.topExpenseCategories.length > 0 && (
                <div className="border-t pt-3">
                  <p className="pb-1.5 text-sm font-medium">{t("financials.topExpenseCategories")}</p>
                  {monthly.topExpenseCategories.map((c) => (
                    <div key={c.categoryId} className="flex justify-between py-0.5 text-sm">
                      <span className="text-muted-foreground">{c.categoryName}</span>
                      <span className="tabular-nums">{formatMoney(c.amount, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        ) : yearlyLoading || !yearly ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <StatLine label={t("financials.kpiRevenue")} value={formatMoney(yearly.totalRevenue, currency)} />
              <StatLine label={t("financials.kpiExpenses")} value={formatMoney(yearly.totalExpenses, currency)} />
              <StatLine label={t("financials.kpiNetIncome")} value={formatMoney(yearly.netIncome, currency)} />
            </div>
            <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
              <div className="flex items-center gap-2 text-sm">
                <Trophy className="size-4 text-success" />
                <span className="text-muted-foreground">{t("financials.bestMonth")}:</span>
                <span className="font-medium">
                  {yearly.bestMonth ? `${yearly.bestMonth.label} (${formatMoney(yearly.bestMonth.netIncome, currency)})` : "—"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <TrendingDown className="size-4 text-destructive" />
                <span className="text-muted-foreground">{t("financials.worstMonth")}:</span>
                <span className="font-medium">
                  {yearly.worstMonth ? `${yearly.worstMonth.label} (${formatMoney(yearly.worstMonth.netIncome, currency)})` : "—"}
                </span>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="pb-1.5 text-sm font-medium">{t("financials.monthlyComparison")}</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("financials.granularityMonthly")}</TableHead>
                    <TableHead className="text-end">{t("financials.kpiRevenue")}</TableHead>
                    <TableHead className="text-end">{t("financials.kpiExpenses")}</TableHead>
                    <TableHead className="text-end">{t("financials.kpiNetIncome")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearly.monthlyComparison.map((m) => (
                    <TableRow key={m.label}>
                      <TableCell>{m.label}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatMoney(m.revenue, currency)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatMoney(m.expenses, currency)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatMoney(m.netIncome, currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
