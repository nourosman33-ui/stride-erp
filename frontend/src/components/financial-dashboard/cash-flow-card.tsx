"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Banknote, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getCashFlow, recordActualClosingCash, setOpeningCash } from "@/lib/api/financial-dashboard";
import { useLocale, type TranslationKey } from "@/lib/i18n/locale-context";
import { formatMoney } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATUS_KEY: Record<string, TranslationKey> = {
  balanced: "cashFlow.balanced",
  shortage: "cashFlow.shortage",
  surplus: "cashFlow.surplus",
  not_counted: "cashFlow.notCounted",
};

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function CashFlowCard({ storeId, currency }: { storeId: string; currency: string }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const date = todayIso();
  const [openingInput, setOpeningInput] = React.useState("");
  const [actualInput, setActualInput] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["cash-flow", storeId, date],
    queryFn: () => getCashFlow(storeId, date),
  });

  const openingMutation = useMutation({
    mutationFn: (amount: number) => setOpeningCash(storeId, date, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-flow", storeId, date] });
      toast.success(t("cashFlow.saved"));
      setOpeningInput("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("cashFlow.saveFailed")),
  });

  const actualMutation = useMutation({
    mutationFn: (amount: number) => recordActualClosingCash(storeId, date, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-flow", storeId, date] });
      toast.success(t("cashFlow.saved"));
      setActualInput("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("cashFlow.saveFailed")),
  });

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("cashFlow.title")}</CardTitle>
        </CardHeader>
        <CardContent className="h-40" />
      </Card>
    );
  }

  const badgeVariant =
    data.status === "balanced" ? "secondary" : data.status === "surplus" ? "success" : data.status === "shortage" ? "destructive" : "outline";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="size-4" />
          {t("cashFlow.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("cashFlow.description")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.pendingCashImpact.count > 0 && (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>
              {t("expenses.pendingCalloutOwnerManager", {
                count: data.pendingCashImpact.count,
                amount: formatMoney(data.pendingCashImpact.amount, currency),
              })}
            </AlertTitle>
            <AlertDescription>{t("cashFlow.pendingImpactNote")}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("cashFlow.openingCash")}</span>
            <span className="tabular-nums">{formatMoney(data.openingCash, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("cashFlow.cashSales")}</span>
            <span className="tabular-nums">{formatMoney(data.cashSales, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("cashFlow.cashRefunds")}</span>
            <span className="tabular-nums">-{formatMoney(data.cashRefunds, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("cashFlow.cashExpenses")}</span>
            <span className="tabular-nums">-{formatMoney(data.cashExpenses, currency)}</span>
          </div>
        </div>

        <div className="flex justify-between border-t pt-2 text-sm font-semibold">
          <span>{t("cashFlow.expectedClosingCash")}</span>
          <span className="tabular-nums">{formatMoney(data.expectedClosingCash, currency)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("cashFlow.actualClosingCash")}</span>
          <span className="tabular-nums text-sm font-medium">
            {data.actualClosingCash === null ? "—" : formatMoney(data.actualClosingCash, currency)}
          </span>
        </div>

        {data.difference !== null && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("cashFlow.difference")}</span>
            <Badge variant={badgeVariant}>
              {t(STATUS_KEY[data.status])} ({formatMoney(Math.abs(data.difference), currency)})
            </Badge>
          </div>
        )}

        {data.countedBy && (
          <p className="text-xs text-muted-foreground">
            {t("cashFlow.countedBy", { name: data.countedBy.fullName })}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 border-t pt-3">
          <div className="flex gap-1.5">
            <Input
              type="number"
              step="0.01"
              placeholder={t("cashFlow.setOpeningCash")}
              value={openingInput}
              onChange={(e) => setOpeningInput(e.target.value)}
              className="h-8"
            />
            <Button
              size="sm"
              disabled={!openingInput || openingMutation.isPending}
              onClick={() => openingMutation.mutate(Number(openingInput))}
            >
              {openingMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
          <div className="flex gap-1.5">
            <Input
              type="number"
              step="0.01"
              placeholder={t("cashFlow.recordCount")}
              value={actualInput}
              onChange={(e) => setActualInput(e.target.value)}
              className="h-8"
            />
            <Button
              size="sm"
              disabled={!actualInput || actualMutation.isPending}
              onClick={() => actualMutation.mutate(Number(actualInput))}
            >
              {actualMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
