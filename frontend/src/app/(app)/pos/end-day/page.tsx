"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import {
  getCashFlow,
  getDailyClosing,
  recordActualClosingCash,
  setOpeningCash,
} from "@/lib/api/financial-dashboard";
import { useAuth } from "@/lib/auth-context";
import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatMoney, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { DailyBriefDocument } from "@/components/financial-dashboard/daily-brief-document";
import { PrintOnly } from "@/components/print-document";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function Line({
  label,
  value,
  emphasis,
  indent,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex justify-between py-1 text-sm ${emphasis ? "border-t pt-2 font-semibold" : ""} ${
        indent ? "ps-3 text-muted-foreground" : ""
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default function EndOfDayPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const queryClient = useQueryClient();
  const date = todayIso();

  const [openingInput, setOpeningInput] = React.useState("");
  const [countedInput, setCountedInput] = React.useState("");

  const { data: closing, isLoading: closingLoading } = useQuery({
    queryKey: ["daily-closing", activeStoreId, date],
    queryFn: () => getDailyClosing(activeStoreId!, date),
    enabled: !!activeStoreId,
  });

  const { data: cashFlow, isLoading: cashFlowLoading } = useQuery({
    queryKey: ["cash-flow", activeStoreId, date],
    queryFn: () => getCashFlow(activeStoreId!, date),
    enabled: !!activeStoreId,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["daily-closing"] });
    queryClient.invalidateQueries({ queryKey: ["cash-flow"] });
  }

  const openingMutation = useMutation({
    mutationFn: (amount: number) => setOpeningCash(activeStoreId!, date, amount),
    onSuccess: () => {
      invalidate();
      toast.success(t("cashFlow.saved"));
      setOpeningInput("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("cashFlow.saveFailed")),
  });

  const closeDayMutation = useMutation({
    mutationFn: (amount: number) => recordActualClosingCash(activeStoreId!, date, amount),
    onSuccess: () => {
      invalidate();
      toast.success(t("endDay.dayClosed"));
      setCountedInput("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("cashFlow.saveFailed")),
  });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("endDay.title")} description={t("endDay.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  const loading = closingLoading || cashFlowLoading || !closing || !cashFlow;
  const cur = activeStore?.currency;
  const isClosed = closing?.actualClosingCash !== null && closing?.actualClosingCash !== undefined;

  const differenceBadge =
    closing?.cashDifference === null || closing?.cashDifference === undefined
      ? null
      : closing.cashDifference === 0
        ? { variant: "success" as const, label: t("cashFlow.balanced") }
        : closing.cashDifference > 0
          ? { variant: "secondary" as const, label: t("cashFlow.surplus") }
          : { variant: "destructive" as const, label: t("cashFlow.shortage") };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("endDay.title")}
        description={`${activeStore?.name} · ${date}`}
        actions={
          <div className="flex items-center gap-2">
            {isClosed && (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="size-3.5" />
                {t("endDay.closedBadge")}
              </Badge>
            )}
            <Button variant="outline" size="sm" disabled={loading} onClick={() => window.print()}>
              <Printer className="size-4" />
              {t("endDay.printBrief")}
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{t("dailyClosing.totalSales")}</p>
                <p className="text-2xl font-semibold tabular-nums">{formatMoney(closing.totalSales, cur)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{t("dailyClosing.totalExpenses")}</p>
                <p className="text-2xl font-semibold tabular-nums">{formatMoney(closing.totalExpenses, cur)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{t("dailyClosing.netIncome")}</p>
                <p className="text-2xl font-semibold tabular-nums">{formatMoney(closing.netIncome, cur)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{t("dailyClosing.transactionCount")}</p>
                <p className="text-2xl font-semibold tabular-nums">{formatNumber(closing.transactionCount)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("endDay.sectionSales")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Line label={t("dailyClosing.cashSales")} value={formatMoney(closing.cashSales, cur)} indent />
                <Line label={t("dailyClosing.cardSales")} value={formatMoney(closing.cardSales, cur)} indent />
                <Line
                  label={t("dailyClosing.otherSales")}
                  value={formatMoney(closing.otherPaymentSales, cur)}
                  indent
                />
                <Line label={t("dailyClosing.totalSales")} value={formatMoney(closing.totalSales, cur)} emphasis />
                <div className="pt-3">
                  <p className="pb-1 text-sm font-medium">{t("endDay.sectionExpenses")}</p>
                  {closing.expenseLines.length === 0 ? (
                    <p className="py-1 text-sm text-muted-foreground">{t("expenses.noExpenses")}</p>
                  ) : (
                    closing.expenseLines.map((e) => (
                      <Line
                        key={e.id}
                        label={`${e.description} · ${e.categoryName} · ${e.createdByName}`}
                        value={formatMoney(e.amount, cur)}
                        indent
                      />
                    ))
                  )}
                  <Line
                    label={t("dailyClosing.totalExpenses")}
                    value={formatMoney(closing.totalExpenses, cur)}
                    emphasis
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("endDay.sectionCash")}</CardTitle>
                <p className="text-xs text-muted-foreground">{t("cashFlow.description")}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Line label={t("cashFlow.openingCash")} value={formatMoney(cashFlow.openingCash, cur)} indent />
                  <Line label={`+ ${t("cashFlow.cashSales")}`} value={formatMoney(cashFlow.cashSales, cur)} indent />
                  <Line
                    label={`− ${t("cashFlow.cashRefunds")}`}
                    value={formatMoney(cashFlow.cashRefunds, cur)}
                    indent
                  />
                  <Line
                    label={`− ${t("cashFlow.cashExpenses")}`}
                    value={formatMoney(cashFlow.cashExpenses, cur)}
                    indent
                  />
                  <Line
                    label={t("cashFlow.expectedClosingCash")}
                    value={formatMoney(closing.expectedClosingCash, cur)}
                    emphasis
                  />
                </div>

                {cashFlow.openingCash === 0 && (
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={t("cashFlow.setOpeningCash")}
                      value={openingInput}
                      onChange={(e) => setOpeningInput(e.target.value)}
                      className="h-9"
                    />
                    <Button
                      variant="outline"
                      disabled={!openingInput || openingMutation.isPending}
                      onClick={() => openingMutation.mutate(Number(openingInput))}
                    >
                      {openingMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                      {t("common.save")}
                    </Button>
                  </div>
                )}

                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">{t("endDay.countDrawer")}</p>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={t("cashFlow.recordCount")}
                      value={countedInput}
                      onChange={(e) => setCountedInput(e.target.value)}
                      className="h-9"
                    />
                    <Button
                      disabled={!countedInput || closeDayMutation.isPending}
                      onClick={() => closeDayMutation.mutate(Number(countedInput))}
                    >
                      {closeDayMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      {isClosed ? t("endDay.recount") : t("endDay.closeDay")}
                    </Button>
                  </div>

                  {isClosed && (
                    <>
                      <Line
                        label={t("cashFlow.actualClosingCash")}
                        value={formatMoney(closing.actualClosingCash!, cur)}
                      />
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-sm text-muted-foreground">{t("cashFlow.difference")}</span>
                        {differenceBadge && (
                          <Badge variant={differenceBadge.variant}>
                            {differenceBadge.label} ({formatMoney(Math.abs(closing.cashDifference ?? 0), cur)})
                          </Badge>
                        )}
                      </div>
                      {cashFlow.countedBy && (
                        <p className="text-xs text-muted-foreground">
                          {t("cashFlow.countedBy", { name: cashFlow.countedBy.fullName })}
                        </p>
                      )}
                    </>
                  )}

                  {closing.pendingExpenses.count > 0 && (
                    <p className="pt-1 text-xs text-muted-foreground">
                      {t("dailyClosing.pendingNote", {
                        count: closing.pendingExpenses.count,
                        amount: formatMoney(closing.pendingExpenses.amount, cur),
                      })}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* The artifact that actually comes out of the printer — never shown on
              screen, since the cards above already present the same figures. */}
          <PrintOnly variant="report">
            <DailyBriefDocument
              store={activeStore}
              closing={closing}
              cashFlow={cashFlow}
              preparedBy={user?.fullName ?? ""}
            />
          </PrintOnly>
        </>
      )}
    </div>
  );
}
