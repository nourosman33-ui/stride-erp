"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Loader2,
  Package,
  Printer,
  Search,
  ShieldAlert,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import {
  createReturn,
  getReturnEligibility,
  type ReturnEligibilityLine,
  type SalesReturn,
} from "@/lib/api/returns";
import { ReturnReceiptView } from "@/components/return-receipt-view";
import { getPosCatalog, listSales, type PosCatalogItem } from "@/lib/api/sales";
import type { PaymentMethodType } from "@/lib/api/types";
import { useAuth } from "@/lib/auth-context";
import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDate, formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { PAYMENT_METHOD_KEY } from "@/lib/payment-methods";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PAYMENT_METHODS: PaymentMethodType[] = ["cash", "card", "mobile_wallet", "bank_transfer"];

interface ReturnRow {
  quantity: number;
  restock: boolean;
}

export default function ReturnsPage() {
  const { t } = useLocale();
  const { hasRole } = useAuth();
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const queryClient = useQueryClient();

  const canOverrideWindow = hasRole("owner", "manager");

  const [search, setSearch] = React.useState("");
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Record<string, ReturnRow>>({});
  const [mode, setMode] = React.useState<"refund" | "exchange">("refund");
  const [refundMethod, setRefundMethod] = React.useState<PaymentMethodType>("cash");
  const [reason, setReason] = React.useState("");
  const [override, setOverride] = React.useState(false);
  const [exchangeCart, setExchangeCart] = React.useState<{ item: PosCatalogItem; quantity: number }[]>([]);
  const [exchangeQuery, setExchangeQuery] = React.useState("");
  const [completed, setCompleted] = React.useState<SalesReturn | null>(null);

  const { data: sales } = useQuery({
    queryKey: ["sales", activeStoreId],
    queryFn: () => listSales(activeStoreId!),
    enabled: !!activeStoreId && !orderId,
  });

  const { data: eligibility, isLoading: eligibilityLoading } = useQuery({
    queryKey: ["return-eligibility", orderId],
    queryFn: () => getReturnEligibility(orderId!),
    enabled: !!orderId,
  });

  const { data: catalog } = useQuery({
    queryKey: ["pos-catalog", activeStoreId],
    queryFn: () => getPosCatalog(activeStoreId!),
    enabled: !!activeStoreId && mode === "exchange",
  });

  const filteredSales = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sales ?? [];
    if (!q) return list.slice(0, 8);
    return list
      .filter((o) =>
        [o.invoiceNumber, o.customer?.name, o.customer?.phone, o.cashier?.fullName].some((f) =>
          f?.toLowerCase().includes(q),
        ),
      )
      .slice(0, 8);
  }, [sales, search]);

  const exchangeResults = React.useMemo(() => {
    const q = exchangeQuery.trim().toLowerCase();
    if (!q) return [];
    return (catalog ?? [])
      .filter((v) =>
        [v.productName, v.colorName, v.sizeLabel, v.barcode].some((f) => f.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [catalog, exchangeQuery]);

  function resetAll() {
    setOrderId(null);
    setRows({});
    setMode("refund");
    setReason("");
    setOverride(false);
    setExchangeCart([]);
    setExchangeQuery("");
    setSearch("");
  }

  function setQty(line: ReturnEligibilityLine, quantity: number) {
    setRows((prev) => {
      const next = { ...prev };
      const clamped = Math.max(0, Math.min(line.quantityReturnable, quantity));
      if (clamped === 0) delete next[line.orderLineId];
      else next[line.orderLineId] = { quantity: clamped, restock: prev[line.orderLineId]?.restock ?? true };
      return next;
    });
  }

  function toggleRestock(orderLineId: string) {
    setRows((prev) =>
      prev[orderLineId]
        ? { ...prev, [orderLineId]: { ...prev[orderLineId], restock: !prev[orderLineId].restock } }
        : prev,
    );
  }

  const selectedLines = React.useMemo(
    () =>
      (eligibility?.lines ?? [])
        .filter((l) => rows[l.orderLineId]?.quantity > 0)
        .map((l) => ({ line: l, ...rows[l.orderLineId] })),
    [eligibility, rows],
  );

  const refundValue = selectedLines.reduce(
    (sum, r) => sum + r.line.refundPerUnit * r.quantity,
    0,
  );
  const vatRate = toNumber(activeStore?.vatRate ?? 14);
  const exchangeValue = exchangeCart.reduce(
    (sum, l) => sum + l.item.sellingPrice * l.quantity * (1 + vatRate / 100),
    0,
  );
  const balance = mode === "exchange" ? exchangeValue - refundValue : -refundValue;

  const blockedByWindow = !!eligibility && !eligibility.withinReturnWindow && !(canOverrideWindow && override);

  const mutation = useMutation({
    mutationFn: () =>
      createReturn({
        originalOrderId: orderId!,
        type: mode,
        lines: selectedLines.map((r) => ({
          orderLineId: r.line.orderLineId,
          quantity: r.quantity,
          restock: r.restock,
        })),
        exchangeLines:
          mode === "exchange"
            ? exchangeCart.map((l) => ({ variantId: l.item.variantId, quantity: l.quantity }))
            : undefined,
        refundMethod,
        balancePaymentMethod: refundMethod,
        reason: reason || undefined,
        overrideReturnWindow: override || undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["pos-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      setCompleted(result);
      resetAll();
      toast.success(t("returns.processed", { number: result.returnNumber }));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("returns.failed")),
  });

  function submit() {
    if (selectedLines.length === 0) return toast.error(t("returns.pickItems"));
    if (mode === "exchange" && exchangeCart.length === 0) return toast.error(t("returns.pickExchange"));
    mutation.mutate();
  }

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("returns.title")} description={t("returns.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  const cur = activeStore?.currency;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("returns.title")}
        description={activeStore?.name}
        actions={
          orderId ? (
            <Button variant="outline" size="sm" onClick={resetAll}>
              {t("returns.changeSale")}
            </Button>
          ) : undefined
        }
      />

      {!orderId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("returns.lookupTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("returns.lookupHint")}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("returns.lookupPlaceholder")}
                className="h-11 ps-9 text-base"
              />
            </div>
            <p className="text-xs font-medium text-muted-foreground">{t("returns.searchRecent")}</p>
            {filteredSales.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("returns.noRecentSales")}
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {filteredSales.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setOrderId(o.id)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-start hover:bg-accent"
                  >
                    <div>
                      <p className="font-mono text-xs font-medium">{o.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(o.orderDate)} · {o.customer?.name ?? t("salesHistory.walkIn")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums">
                        {formatMoney(o.grandTotal, cur)}
                      </span>
                      <Badge variant="outline">{t("returns.selectSale")}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {orderId && eligibilityLoading && <Skeleton className="h-96 w-full" />}

      {orderId && eligibility && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div>
                <p className="font-mono text-sm font-medium">{eligibility.invoiceNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {t("returns.soldOn", {
                    date: formatDate(eligibility.orderDate),
                    days: eligibility.daysSinceSale,
                  })}
                  {eligibility.customer ? ` · ${eligibility.customer.name}` : ""}
                </p>
              </div>
              <Badge variant={eligibility.withinReturnWindow ? "success" : "warning"}>
                {eligibility.withinReturnWindow
                  ? t("returns.windowOk", { days: eligibility.returnPeriodDays })
                  : t("returns.windowExpired", { days: eligibility.returnPeriodDays })}
              </Badge>
            </CardContent>
          </Card>

          {eligibility.isVoided && (
            <Card>
              <CardContent className="flex items-center gap-2 py-6 text-sm text-destructive">
                <ShieldAlert className="size-5" />
                {t("returns.voidedSale")}
              </CardContent>
            </Card>
          )}

          {!eligibility.withinReturnWindow && !eligibility.isVoided && (
            <Card>
              <CardContent className="space-y-2 pt-1">
                <p className="flex items-center gap-2 text-sm text-warning">
                  <AlertTriangle className="size-4" />
                  {t("returns.windowOverrideNeeded")}
                </p>
                {canOverrideWindow && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={override}
                      onChange={(e) => setOverride(e.target.checked)}
                      className="size-4"
                    />
                    {t("returns.windowOverrideLabel")}
                  </label>
                )}
              </CardContent>
            </Card>
          )}

          {!eligibility.isVoided && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("returns.itemsTitle")}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {eligibility.lines.every((l) => l.quantityReturnable === 0) ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        {t("returns.nothingReturnable")}
                      </p>
                    ) : (
                      <div className="divide-y">
                        {eligibility.lines.map((line) => {
                          const row = rows[line.orderLineId];
                          const disabled = line.quantityReturnable === 0;
                          return (
                            <div
                              key={line.orderLineId}
                              className={`flex flex-wrap items-center gap-3 px-4 py-3 ${disabled ? "opacity-50" : ""}`}
                            >
                              <div className="size-10 shrink-0 overflow-hidden rounded bg-muted">
                                {line.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={line.imageUrl} alt="" className="size-full object-cover" />
                                ) : (
                                  <Package className="size-full p-2 text-muted-foreground/40" />
                                )}
                              </div>
                              <div className="min-w-40 flex-1">
                                <p className="text-sm font-medium">{line.productName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {line.color} · {line.size} · {formatMoney(line.refundPerUnit, cur)}{" "}
                                  {t("returns.colRefund").toLowerCase()}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {t("returns.colSold")} {line.quantitySold} ·{" "}
                                  {t("returns.colReturned")} {line.quantityReturned}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={0}
                                  max={line.quantityReturnable}
                                  disabled={disabled}
                                  value={row?.quantity ?? 0}
                                  onChange={(e) => setQty(line, Number(e.target.value))}
                                  className="h-8 w-20 text-center"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={row?.restock === false ? "destructive" : "outline"}
                                  disabled={!row}
                                  onClick={() => toggleRestock(line.orderLineId)}
                                  className="text-xs"
                                >
                                  {row?.restock === false ? t("returns.restockNo") : t("returns.restockYes")}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {mode === "exchange" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t("returns.exchangeTitle")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="relative">
                        <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={exchangeQuery}
                          onChange={(e) => setExchangeQuery(e.target.value)}
                          placeholder={t("returns.exchangeSearch")}
                          className="ps-9"
                        />
                      </div>
                      {exchangeResults.length > 0 && (
                        <ScrollArea className="h-48 rounded-md border">
                          <div className="divide-y">
                            {exchangeResults.map((v) => (
                              <button
                                key={v.variantId}
                                type="button"
                                onClick={() => {
                                  setExchangeCart((prev) => {
                                    const found = prev.find((p) => p.item.variantId === v.variantId);
                                    return found
                                      ? prev.map((p) =>
                                          p.item.variantId === v.variantId
                                            ? { ...p, quantity: p.quantity + 1 }
                                            : p,
                                        )
                                      : [...prev, { item: v, quantity: 1 }];
                                  });
                                  setExchangeQuery("");
                                }}
                                className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-accent"
                              >
                                <span>
                                  {v.productName}
                                  <span className="ms-1 text-xs text-muted-foreground">
                                    {v.colorName} · {v.sizeLabel}
                                  </span>
                                </span>
                                <span className="tabular-nums">
                                  {formatMoney(v.sellingPrice, cur)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                      {exchangeCart.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          {t("returns.exchangeEmpty")}
                        </p>
                      ) : (
                        <div className="divide-y rounded-md border">
                          {exchangeCart.map((l) => (
                            <div key={l.item.variantId} className="flex items-center gap-2 px-3 py-2">
                              <div className="flex-1">
                                <p className="text-sm font-medium">{l.item.productName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {l.item.colorName} · {l.item.sizeLabel}
                                </p>
                              </div>
                              <Input
                                type="number"
                                min={1}
                                value={l.quantity}
                                onChange={(e) =>
                                  setExchangeCart((prev) =>
                                    prev.map((p) =>
                                      p.item.variantId === l.item.variantId
                                        ? { ...p, quantity: Math.max(1, Number(e.target.value)) }
                                        : p,
                                    ),
                                  )
                                }
                                className="h-8 w-16 text-center"
                              />
                              <span className="w-24 text-end text-sm tabular-nums">
                                {formatMoney(l.item.sellingPrice * l.quantity, cur)}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() =>
                                  setExchangeCart((prev) =>
                                    prev.filter((p) => p.item.variantId !== l.item.variantId),
                                  )
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("returns.modeTitle")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setMode("refund")}
                        className={`flex flex-col items-start gap-0.5 rounded-md border p-2.5 text-start transition ${
                          mode === "refund" ? "border-primary bg-accent" : "hover:border-primary"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <Undo2 className="size-4" />
                          {t("returns.modeRefund")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t("returns.modeRefundHint")}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("exchange")}
                        className={`flex flex-col items-start gap-0.5 rounded-md border p-2.5 text-start transition ${
                          mode === "exchange" ? "border-primary bg-accent" : "hover:border-primary"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <ArrowLeftRight className="size-4" />
                          {t("returns.modeExchange")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t("returns.modeExchangeHint")}
                        </span>
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("returns.damagedHint")}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("returns.summaryTitle")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("returns.refundValue")}</span>
                      <span className="tabular-nums">{formatMoney(refundValue, cur)}</span>
                    </div>
                    {mode === "exchange" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("returns.exchangeValue")}</span>
                        <span className="tabular-nums">{formatMoney(exchangeValue, cur)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between text-base font-semibold">
                      <span>
                        {balance > 0
                          ? t("returns.balanceDue")
                          : balance < 0
                            ? t("returns.balanceRefund")
                            : t("returns.settled")}
                      </span>
                      <span className="tabular-nums">{formatMoney(Math.abs(balance), cur)}</span>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-sm text-muted-foreground">
                        {balance > 0 ? t("returns.balanceMethod") : t("returns.refundMethod")}
                      </span>
                      <Select
                        value={refundMethod}
                        onValueChange={(v) => setRefundMethod(v as PaymentMethodType)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m} value={m}>
                              {t(PAYMENT_METHOD_KEY[m])}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Textarea
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("returns.reasonPlaceholder")}
                    />

                    <Button
                      className="w-full"
                      size="lg"
                      disabled={
                        selectedLines.length === 0 ||
                        blockedByWindow ||
                        mutation.isPending ||
                        (mode === "exchange" && exchangeCart.length === 0)
                      }
                      onClick={submit}
                    >
                      {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                      {mode === "refund" ? t("returns.processRefund") : t("returns.processExchange")}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={!!completed} onOpenChange={(o) => !o && setCompleted(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("returns.receiptTitle", { number: completed?.returnNumber ?? "" })}</DialogTitle>
            <DialogDescription>
              {completed &&
                t("returns.receiptAgainst", {
                  invoice: completed.originalOrder?.invoiceNumber ?? "",
                })}
            </DialogDescription>
          </DialogHeader>
          {completed && <ReturnReceiptView salesReturn={completed} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" />
              {t("common.print")}
            </Button>
            <Button onClick={() => setCompleted(null)}>
              <Check className="size-4" />
              {t("returns.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
