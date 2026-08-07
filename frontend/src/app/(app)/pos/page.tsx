"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Minus, Plus, Printer, ScanBarcode, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { checkout, getPosCatalog, type PosCatalogItem } from "@/lib/api/sales";
import type { PaymentMethodType, SalesOrder } from "@/lib/api/types";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CartLine {
  item: PosCatalogItem;
  quantity: number;
}

export default function PosPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { t } = useLocale();
  const queryClient = useQueryClient();

  const PAYMENT_METHODS: { value: PaymentMethodType; label: string }[] = [
    { value: "cash", label: t("pos.methodCash") },
    { value: "card", label: t("pos.methodCard") },
    { value: "mobile_wallet", label: t("pos.methodMobileWallet") },
    { value: "bank_transfer", label: t("pos.methodBankTransfer") },
  ];

  // Cost-free by construction (SalesService.getPosCatalog) — the only catalog/stock read
  // the cashier role is allowed to reach; see access-control.ts and the backend @Roles
  // guards on ProductsController/InventoryController.
  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ["pos-catalog", activeStoreId],
    queryFn: () => getPosCatalog(activeStoreId!),
    enabled: !!activeStoreId,
  });
  const items = React.useMemo(() => catalog ?? [], [catalog]);

  const [query, setQuery] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [discountPct, setDiscountPct] = React.useState(0);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethodType>("cash");
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const [completedOrder, setCompletedOrder] = React.useState<SalesOrder | null>(null);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((v) => [v.productName, v.colorName, v.sizeLabel, v.barcode].some((f) => f.toLowerCase().includes(q)))
      .slice(0, 20);
  }, [items, query]);

  function addToCart(item: PosCatalogItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.variantId === item.variantId);
      if (existing) {
        return prev.map((l) => (l.item.variantId === item.variantId ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { item, quantity: 1 }];
    });
    if (item.quantityOnHand <= 0) {
      toast.warning(t("pos.zeroOnHand", { product: item.productName }));
    }
  }

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const exact = items.find((v) => v.barcode === query.trim());
    if (exact) {
      addToCart(exact);
      setQuery("");
    } else if (results.length === 1) {
      addToCart(results[0]);
      setQuery("");
    }
  }

  function updateQuantity(variantId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.item.variantId === variantId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(variantId: string) {
    setCart((prev) => prev.filter((l) => l.item.variantId !== variantId));
  }

  const subtotal = cart.reduce((sum, l) => sum + l.item.sellingPrice * l.quantity, 0);
  const discountLimit = toNumber(activeStore?.discountApprovalLimitPct ?? 10);
  const discountAmount = subtotal * (discountPct / 100);
  const vatRate = toNumber(activeStore?.vatRate ?? 14);
  const taxableAmount = subtotal - discountAmount;
  const vatAmount = taxableAmount * (vatRate / 100);
  const total = taxableAmount + vatAmount;
  const needsApproval = discountPct > discountLimit;
  const hasOversell = cart.some((l) => l.quantity > l.item.quantityOnHand);

  const checkoutMutation = useMutation({
    mutationFn: () =>
      checkout({
        storeId: activeStoreId!,
        lines: cart.map((l) => ({
          variantId: l.item.variantId,
          quantity: l.quantity,
          discountAmount: Number((l.item.sellingPrice * (discountPct / 100)).toFixed(2)),
        })),
        payments: [{ method: paymentMethod, amount: Number(total.toFixed(2)) }],
      }),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["pos-catalog", activeStoreId] });
      setCompletedOrder(order);
      setReceiptOpen(true);
      setCart([]);
      setDiscountPct(0);
      toast.success(t("pos.saleCompleted", { invoice: order.invoiceNumber }));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("pos.checkoutFailed")),
  });

  const paymentMethodLabel = (method: PaymentMethodType) =>
    PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("pos.title")} description={t("common.noStoreDesc")} />
        <NoStoreSelected />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("pos.title")} description={activeStore?.name} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <form onSubmit={handleScanSubmit}>
            <div className="relative">
              <ScanBarcode className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("pos.scanPlaceholder")}
                className="h-11 ps-9 text-base"
                disabled={catalogLoading}
              />
            </div>
          </form>

          {query && (
            <Card>
              <CardContent className="p-2">
                {results.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("pos.noMatches")}</p>
                ) : (
                  <ScrollArea className="h-72">
                    <div className="space-y-1">
                      {results.map((v) => (
                        <button
                          key={v.variantId}
                          type="button"
                          onClick={() => {
                            addToCart(v);
                            setQuery("");
                          }}
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-start text-sm hover:bg-accent"
                        >
                          <div>
                            <p className="font-medium">{v.productName}</p>
                            <p className="text-xs text-muted-foreground">
                              {v.colorName} · {v.sizeLabel} · {v.barcode}
                            </p>
                          </div>
                          <div className="text-end">
                            <p className="font-medium">{formatMoney(v.sellingPrice, activeStore?.currency)}</p>
                            <p
                              className={`text-xs ${v.quantityOnHand <= 0 ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              {v.quantityOnHand} {t("pos.onHand")}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("pos.cart")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {cart.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  <ShoppingCart className="mx-auto mb-2 size-8 text-muted-foreground/50" />
                  {t("pos.cartEmpty")}
                </p>
              ) : (
                <div className="divide-y">
                  {cart.map((line) => {
                    const overselling = line.quantity > line.item.quantityOnHand;
                    return (
                      <div key={line.item.variantId} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{line.item.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.item.colorName} · {line.item.sizeLabel}
                          </p>
                          {overselling && (
                            <p className="flex items-center gap-1 text-xs text-destructive">
                              <AlertTriangle className="size-3" />
                              {t("pos.onlyXOnHand", { count: line.item.quantityOnHand })}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-7"
                            onClick={() => updateQuantity(line.item.variantId, -1)}
                          >
                            <Minus className="size-3.5" />
                          </Button>
                          <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-7"
                            onClick={() => updateQuantity(line.item.variantId, 1)}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                        <p className="w-24 text-end text-sm font-medium tabular-nums">
                          {formatMoney(line.item.sellingPrice * line.quantity, activeStore?.currency)}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                          onClick={() => removeLine(line.item.variantId)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("pos.summary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("pos.subtotal")}</span>
                <span className="tabular-nums">{formatMoney(subtotal, activeStore?.currency)}</span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("pos.discountPct")}</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={discountPct}
                    onChange={(e) => setDiscountPct(Number(e.target.value))}
                    className="h-7 w-20 text-end"
                  />
                </div>
                {needsApproval && (
                  <p className="flex items-center gap-1 text-xs text-warning">
                    <AlertTriangle className="size-3" />
                    {t("pos.aboveLimit", { limit: discountLimit })}
                  </p>
                )}
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("pos.vatWithRate", { rate: vatRate })}</span>
                <span className="tabular-nums">{formatMoney(vatAmount, activeStore?.currency)}</span>
              </div>

              <Separator />

              <div className="flex justify-between text-base font-semibold">
                <span>{t("pos.total")}</span>
                <span className="tabular-nums">{formatMoney(total, activeStore?.currency)}</span>
              </div>

              <div className="space-y-1.5">
                <span className="text-sm text-muted-foreground">{t("pos.paymentMethod")}</span>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as PaymentMethodType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {hasOversell && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="size-3" />
                  {t("pos.reduceQuantities")}
                </p>
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={cart.length === 0 || hasOversell || checkoutMutation.isPending}
                onClick={() => checkoutMutation.mutate()}
              >
                {checkoutMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("pos.completeSale")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pos.receiptTitle", { invoice: completedOrder?.invoiceNumber ?? "" })}</DialogTitle>
            <DialogDescription>
              {completedOrder && formatDateTime(completedOrder.orderDate)} · {activeStore?.name}
            </DialogDescription>
          </DialogHeader>
          {completedOrder && (
            <div className="space-y-2 text-sm">
              {completedOrder.lines?.map((line) => (
                <div key={line.id} className="flex justify-between">
                  <span>
                    {line.variant?.product?.modelName ?? "Item"} × {line.quantity}
                  </span>
                  <span className="tabular-nums">{formatMoney(line.netPrice, activeStore?.currency)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between text-muted-foreground">
                <span>{t("pos.discount")}</span>
                <span>-{formatMoney(completedOrder.discountTotal, activeStore?.currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t("pos.vat")}</span>
                <span>{formatMoney(completedOrder.taxTotal, activeStore?.currency)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>{t("pos.total")}</span>
                <span>{formatMoney(completedOrder.grandTotal, activeStore?.currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t("pos.paidVia")}</span>
                <span>{completedOrder.payments?.map((p) => paymentMethodLabel(p.method)).join(", ")}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" />
              {t("common.print")}
            </Button>
            <Button onClick={() => setReceiptOpen(false)}>{t("common.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
