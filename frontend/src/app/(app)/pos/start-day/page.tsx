"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Loader2, Sunrise } from "lucide-react";
import { toast } from "sonner";

import { getCashFlow, setOpeningCash } from "@/lib/api/financial-dashboard";
import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
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

export default function StartOfDayPage() {
  const { t } = useLocale();
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const queryClient = useQueryClient();
  const date = todayIso();

  const [floatInput, setFloatInput] = React.useState("");

  const { data: cashFlow, isLoading } = useQuery({
    queryKey: ["cash-flow", activeStoreId, date],
    queryFn: () => getCashFlow(activeStoreId!, date),
    enabled: !!activeStoreId,
  });

  const openMutation = useMutation({
    mutationFn: (amount: number) => setOpeningCash(activeStoreId!, date, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-flow"] });
      queryClient.invalidateQueries({ queryKey: ["daily-closing"] });
      toast.success(t("startDay.dayOpened"));
      setFloatInput("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("cashFlow.saveFailed")),
  });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("startDay.title")} description={t("startDay.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  const cur = activeStore?.currency;
  const isOpen = cashFlow?.isOpen ?? false;
  const carryForward = cashFlow?.previousClosingCash ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("startDay.title")}
        description={`${activeStore?.name} · ${date}`}
        actions={
          isOpen ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="size-3.5" />
              {t("startDay.openBadge")}
            </Badge>
          ) : undefined
        }
      />

      {isLoading || !cashFlow ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sunrise className="size-4" />
                {isOpen ? t("startDay.openedTitle") : t("startDay.openTitle")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {isOpen ? t("startDay.openedHint") : t("startDay.openHint")}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">{t("startDay.carryForward")}</span>
                <span className="tabular-nums">
                  {carryForward === null ? t("startDay.noPreviousCount") : formatMoney(carryForward, cur)}
                </span>
              </div>

              <div className="flex justify-between text-sm font-semibold">
                <span>{t("cashFlow.openingCash")}</span>
                <span className="tabular-nums">{formatMoney(cashFlow.openingCash, cur)}</span>
              </div>

              {isOpen && cashFlow.openedBy && (
                <p className="text-xs text-muted-foreground">
                  {t("startDay.openedBy", {
                    name: cashFlow.openedBy.fullName,
                    at: cashFlow.openedAt ? formatDateTime(cashFlow.openedAt) : "",
                  })}
                </p>
              )}

              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-medium">
                  {isOpen ? t("startDay.adjustFloat") : t("startDay.countFloat")}
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={t("startDay.floatPlaceholder")}
                    value={floatInput}
                    onChange={(e) => setFloatInput(e.target.value)}
                    className="h-9"
                  />
                  <Button
                    disabled={floatInput === "" || openMutation.isPending}
                    onClick={() => openMutation.mutate(Number(floatInput))}
                  >
                    {openMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sunrise className="size-4" />
                    )}
                    {isOpen ? t("common.save") : t("startDay.openDay")}
                  </Button>
                </div>
                {carryForward !== null && !isOpen && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFloatInput(String(carryForward))}
                  >
                    {t("startDay.useCarryForward", { amount: formatMoney(carryForward, cur) })}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("startDay.nextTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {isOpen ? t("startDay.nextOpen") : t("startDay.nextClosed")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" disabled={!isOpen}>
                  <Link href="/pos">
                    {t("nav.pos")}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/pos/expenses">{t("expenses.navLabel")}</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/pos/end-day">{t("endDay.navLabel")}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
