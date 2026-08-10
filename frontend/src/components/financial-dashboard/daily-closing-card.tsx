"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";

import { getDailyClosing } from "@/lib/api/financial-dashboard";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatMoney, formatNumber } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportMenuButton } from "@/components/export-menu-button";

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function DailyClosingCard({ storeId, currency }: { storeId: string; currency: string }) {
  const { t } = useLocale();
  const date = todayIso();

  const { data, isLoading } = useQuery({
    queryKey: ["daily-closing", storeId, date],
    queryFn: () => getDailyClosing(storeId, date),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="size-4" />
          {t("dailyClosing.title")}
        </CardTitle>
        <ExportMenuButton
          kind="expenses"
          storeId={storeId}
          formats={["pdf"]}
          label={t("exports.exportDailyClosing")}
          path={() => `/export/daily-closing.pdf`}
          params={{ date }}
        />
      </CardHeader>
      <CardContent className="space-y-1.5">
        {isLoading || !data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <Line label={t("dailyClosing.totalSales")} value={formatMoney(data.totalSales, currency)} />
            <Line label={t("dailyClosing.cashSales")} value={formatMoney(data.cashSales, currency)} />
            <Line label={t("dailyClosing.cardSales")} value={formatMoney(data.cardSales, currency)} />
            <Line label={t("dailyClosing.otherSales")} value={formatMoney(data.otherPaymentSales, currency)} />
            <div className="border-t pt-1.5" />
            <Line label={t("dailyClosing.totalExpenses")} value={formatMoney(data.totalExpenses, currency)} />
            <Line label={t("dailyClosing.cashExpenses")} value={formatMoney(data.cashExpenses, currency)} />
            <div className="flex justify-between border-t pt-1.5 text-sm font-semibold">
              <span>{t("dailyClosing.netIncome")}</span>
              <span className="tabular-nums">{formatMoney(data.netIncome, currency)}</span>
            </div>
            <Line label={t("dailyClosing.transactionCount")} value={formatNumber(data.transactionCount)} />
            {data.pendingExpenses.count > 0 && (
              <p className="pt-1.5 text-xs text-muted-foreground">
                {t("dailyClosing.pendingNote", {
                  count: data.pendingExpenses.count,
                  amount: formatMoney(data.pendingExpenses.amount, currency),
                })}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
