"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useActiveStore } from "@/lib/store-context";
import { useLocale, type TranslationKey } from "@/lib/i18n/locale-context";
import { checkout, getPosCatalog, type PosCatalogItem } from "@/lib/api/sales";
import { getCustomerByPhone } from "@/lib/api/customers";
import type { CustomerWithStats, PaymentMethodType, SalesOrder } from "@/lib/api/types";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { ReceiptView } from "@/components/receipt-view";
import { Badge } from "@/components/ui/badge";
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

interface GroupedProduct {
  productId: string;
  productName: string;
  imageUrl: string | null;
  categoryId: string;
  categoryName: string;
  variants: PosCatalogItem[];
  minPrice: number;
  totalOnHand: number;
}

function groupByProduct(items: PosCatalogItem[]): GroupedProduct[] {
  const map = new Map<string, GroupedProduct>();
  for (const item of items) {
    let g = map.get(item.productId);
    if (!g) {
      g = {
        productId: item.productId,
        productName: item.productName,
        imageUrl: item.imageUrl,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        variants: [],
        minPrice: item.sellingPrice,
        totalOnHand: 0,
      };
      map.set(item.productId, g);
    }
    g.variants.push(item);
    g.minPrice = Math.min(g.minPrice, item.sellingPrice);
    g.totalOnHand += item.quantityOnHand;
  }
  return Array.from(map.values());
}

type SelectedCustomer =
  | { kind: "existing"; customer: CustomerWithStats }
  | { kind: "new"; name: string; phone: string }
  | null;

function computeTierLocal(
  lifetimeSpending: number,
  thresholds: { silver: number; gold: number; platinum: number },
): "bronze" | "silver" | "gold" | "platinum" {
  if (lifetimeSpending >= thresholds.platinum) return "platinum";
  if (lifetimeSpending >= thresholds.gold) return "gold";
  if (lifetimeSpending >= thresholds.silver) return "silver";
  return "bronze";
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
  const groups = React.useMemo(() => groupByProduct(items), [items]);
  const categories = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(item.categoryId, item.categoryName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  const [query, setQuery] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [discountPct, setDiscountPct] = React.useState(0);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethodType>("cash");
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const [completedOrder, setCompletedOrder] = React.useState<SalesOrder | null>(null);
  const [pickerProduct, setPickerProduct] = React.useState<GroupedProduct | null>(null);

  // Customer / loyalty (FR: search-by-phone at checkout, create-inline if not found).
  const [phoneQuery, setPhoneQuery] = React.useState("");
  const [debouncedPhone, setDebouncedPhone] = React.useState("");
  const [newCustomerName, setNewCustomerName] = React.useState("");
  const [selectedCustomer, setSelectedCustomer] = React.useState<SelectedCustomer>(null);
  const [redeemPoints, setRedeemPoints] = React.useState(0);
  const [amountTendered, setAmountTendered] = React.useState("");

  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedPhone(phoneQuery.trim()), 350);
    return () => clearTimeout(id);
  }, [phoneQuery]);

  const { data: foundCustomer, isFetching: customerLookupLoading } = useQuery({
    queryKey: ["customer-by-phone", debouncedPhone],
    queryFn: () => getCustomerByPhone(debouncedPhone),
    enabled: debouncedPhone.length >= 4 && !selectedCustomer,
  });

  const filteredGroups = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (selectedCategory !== "all" && g.categoryId !== selectedCategory) return false;
      if (!q) return true;
      return (
        g.productName.toLowerCase().includes(q) ||
        g.variants.some(
          (v) =>
            v.barcode.toLowerCase().includes(q) ||
            v.colorName.toLowerCase().includes(q) ||
            v.sizeLabel.toLowerCase().includes(q),
        )
      );
    });
  }, [groups, selectedCategory, query]);

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
    }
  }

  function handleCardClick(group: GroupedProduct) {
    if (group.variants.length === 1) {
      addToCart(group.variants[0]);
    } else {
      setPickerProduct(group);
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

  function resetCustomer() {
    setSelectedCustomer(null);
    setPhoneQuery("");
    setNewCustomerName("");
    setRedeemPoints(0);
  }

  const subtotal = cart.reduce((sum, l) => sum + l.item.sellingPrice * l.quantity, 0);
  const discountLimit = toNumber(activeStore?.discountApprovalLimitPct ?? 10);
  const discountAmount = subtotal * (discountPct / 100);
  const vatRate = toNumber(activeStore?.vatRate ?? 14);
  const taxableAmount = subtotal - discountAmount;
  const vatAmount = taxableAmount * (vatRate / 100);
  const grandTotal = taxableAmount + vatAmount;
  const needsApproval = discountPct > discountLimit;
  const hasOversell = cart.some((l) => l.quantity > l.item.quantityOnHand);

  const pointValue = toNumber(activeStore?.loyaltyPointValue ?? 1) || 1;
  const customerPointsBalance = selectedCustomer?.kind === "existing" ? selectedCustomer.customer.pointsBalance : 0;
  const maxRedeemable = Math.max(0, Math.min(customerPointsBalance, Math.floor(grandTotal / pointValue)));
  React.useEffect(() => {
    if (redeemPoints > maxRedeemable) setRedeemPoints(maxRedeemable);
  }, [maxRedeemable, redeemPoints]);
  const redemptionValue = redeemPoints * pointValue;
  const netPayable = Math.max(0, grandTotal - redemptionValue);

  const tenderedNum = amountTendered === "" ? netPayable : Number(amountTendered);
  const changeDue = paymentMethod === "cash" ? Math.max(0, tenderedNum - netPayable) : 0;
  const tenderInsufficient = paymentMethod === "cash" && amountTendered !== "" && tenderedNum < netPayable;

  const thresholds = {
    silver: toNumber(activeStore?.loyaltySilverThreshold ?? 5000),
    gold: toNumber(activeStore?.loyaltyGoldThreshold ?? 15000),
    platinum: toNumber(activeStore?.loyaltyPlatinumThreshold ?? 40000),
  };

  const checkoutMutation = useMutation({
    mutationFn: () =>
      checkout({
        storeId: activeStoreId!,
        customerId: selectedCustomer?.kind === "existing" ? selectedCustomer.customer.id : undefined,
        newCustomer:
          selectedCustomer?.kind === "new"
            ? { name: selectedCustomer.name, phone: selectedCustomer.phone || undefined }
            : undefined,
        lines: cart.map((l) => ({
          variantId: l.item.variantId,
          quantity: l.quantity,
          discountAmount: Number((l.item.sellingPrice * (discountPct / 100)).toFixed(2)),
        })),
        payments: [{ method: paymentMethod, amount: Number(netPayable.toFixed(2)) }],
        redeemPoints: redeemPoints > 0 ? redeemPoints : undefined,
        amountTendered: paymentMethod === "cash" ? Number(tenderedNum.toFixed(2)) : undefined,
      }),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["pos-catalog", activeStoreId] });
      setCompletedOrder(order);
      setReceiptOpen(true);
      setCart([]);
      setDiscountPct(0);
      setAmountTendered("");
      resetCustomer();
      toast.success(t("pos.saleCompleted", { invoice: order.invoiceNumber }));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("pos.checkoutFailed")),
  });

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

          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={selectedCategory === "all" ? "default" : "outline"}
              onClick={() => setSelectedCategory("all")}
            >
              {t("pos.categoryAll")}
            </Button>
            {categories.map((c) => (
              <Button
                key={c.id}
                type="button"
                size="sm"
                variant={selectedCategory === c.id ? "default" : "outline"}
                onClick={() => setSelectedCategory(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>

          <Card>
            <CardContent className="p-3">
              {filteredGroups.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{t("pos.gridEmpty")}</p>
              ) : (
                <ScrollArea className="h-[420px]">
                  <div className="grid grid-cols-2 gap-3 pe-3 sm:grid-cols-3 xl:grid-cols-4">
                    {filteredGroups.map((g) => (
                      <button
                        key={g.productId}
                        type="button"
                        onClick={() => handleCardClick(g)}
                        className="group flex flex-col overflow-hidden rounded-lg border text-start transition hover:border-primary hover:shadow-sm"
                      >
                        <div className="aspect-square w-full overflow-hidden bg-muted">
                          {g.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={g.imageUrl}
                              alt={g.productName}
                              className="size-full object-cover transition group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center">
                              <Package className="size-8 text-muted-foreground/40" />
                            </div>
                          )}
                        </div>
                        <div className="space-y-0.5 p-2">
                          <p className="truncate text-xs font-medium">{g.productName}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">
                              {formatMoney(g.minPrice, activeStore?.currency)}
                            </span>
                            <span
                              className={`text-[11px] ${g.totalOnHand <= 0 ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              {g.totalOnHand <= 0 ? t("pos.outOfStock") : `${g.totalOnHand} ${t("pos.onHand")}`}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

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

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("pos.customer")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-md border p-2.5">
                  <div className="flex items-center gap-2">
                    <UserRound className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {selectedCustomer.kind === "existing" ? selectedCustomer.customer.name : selectedCustomer.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedCustomer.kind === "existing"
                          ? `${selectedCustomer.customer.phone ?? ""} · ${selectedCustomer.customer.pointsBalance} pts · ${t(
                              `loyaltyTiers.${computeTierLocal(selectedCustomer.customer.lifetimeSpending, thresholds)}` as TranslationKey,
                            )}`
                          : selectedCustomer.phone}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="size-7" onClick={resetCustomer}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={phoneQuery}
                      onChange={(e) => setPhoneQuery(e.target.value)}
                      placeholder={t("pos.customerPhonePlaceholder")}
                      className="ps-9"
                    />
                  </div>
                  {debouncedPhone.length >= 4 && (
                    <div className="rounded-md border p-2.5 text-sm">
                      {customerLookupLoading ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : foundCustomer ? (
                        <button
                          type="button"
                          className="flex w-full items-center justify-between text-start hover:opacity-80"
                          onClick={() => setSelectedCustomer({ kind: "existing", customer: foundCustomer })}
                        >
                          <span>
                            {t("pos.customerFound", {
                              name: foundCustomer.name,
                              points: foundCustomer.pointsBalance,
                              tier: t(
                                `loyaltyTiers.${computeTierLocal(foundCustomer.lifetimeSpending, thresholds)}` as TranslationKey,
                              ),
                            })}
                          </span>
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-muted-foreground">{t("pos.customerNotFound")}</p>
                          <Input
                            value={newCustomerName}
                            onChange={(e) => setNewCustomerName(e.target.value)}
                            placeholder={t("pos.newCustomerNamePlaceholder")}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!newCustomerName.trim()}
                            onClick={() =>
                              setSelectedCustomer({ kind: "new", name: newCustomerName.trim(), phone: debouncedPhone })
                            }
                          >
                            {t("pos.createCustomerInline", { name: newCustomerName.trim() || "…" })}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {selectedCustomer?.kind === "existing" && maxRedeemable > 0 && (
                <div className="space-y-1.5 border-t pt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("pos.redeemPoints")}</span>
                    <Input
                      type="number"
                      min={0}
                      max={maxRedeemable}
                      value={redeemPoints}
                      onChange={(e) =>
                        setRedeemPoints(Math.max(0, Math.min(maxRedeemable, Number(e.target.value))))
                      }
                      className="h-7 w-20 text-end"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("pos.pointsAvailable", {
                      points: maxRedeemable,
                      value: formatMoney(maxRedeemable * pointValue, activeStore?.currency),
                    })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

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
                <span className="tabular-nums">{formatMoney(grandTotal, activeStore?.currency)}</span>
              </div>

              {redeemPoints > 0 && (
                <>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{t("pos.loyalty")}</span>
                    <span>-{formatMoney(redemptionValue, activeStore?.currency)}</span>
                  </div>
                  <div className="flex justify-between text-base font-semibold">
                    <span>{t("receipt.amountPaid")}</span>
                    <span className="tabular-nums">{formatMoney(netPayable, activeStore?.currency)}</span>
                  </div>
                </>
              )}

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

              {paymentMethod === "cash" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("pos.tender")}</span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={amountTendered}
                      onChange={(e) => setAmountTendered(e.target.value)}
                      placeholder={t("pos.tenderPlaceholder")}
                      className="h-7 w-28 text-end"
                    />
                  </div>
                  {tenderInsufficient ? (
                    <p className="flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="size-3" />
                      {t("pos.insufficientTender")}
                    </p>
                  ) : (
                    changeDue > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("pos.changeDue")}</span>
                        <span className="tabular-nums">{formatMoney(changeDue, activeStore?.currency)}</span>
                      </div>
                    )
                  )}
                </div>
              )}

              {hasOversell && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="size-3" />
                  {t("pos.reduceQuantities")}
                </p>
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={cart.length === 0 || hasOversell || tenderInsufficient || checkoutMutation.isPending}
                onClick={() => checkoutMutation.mutate()}
              >
                {checkoutMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("pos.completeSale")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!pickerProduct} onOpenChange={(open) => !open && setPickerProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pos.selectVariantTitle", { product: pickerProduct?.productName ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {pickerProduct?.variants.map((v) => (
              <button
                key={v.variantId}
                type="button"
                disabled={v.quantityOnHand <= 0}
                onClick={() => {
                  addToCart(v);
                  setPickerProduct(null);
                }}
                className="flex flex-col items-start gap-1 rounded-md border p-2.5 text-start text-sm hover:bg-accent disabled:opacity-40"
              >
                <span className="font-medium">
                  {v.colorName} · {v.sizeLabel}
                </span>
                <span className="tabular-nums">{formatMoney(v.sellingPrice, activeStore?.currency)}</span>
                <Badge variant={v.quantityOnHand <= 0 ? "destructive" : "outline"} className="text-[10px]">
                  {v.quantityOnHand <= 0 ? t("pos.outOfStock") : `${v.quantityOnHand} ${t("pos.onHand")}`}
                </Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pos.receiptTitle", { invoice: completedOrder?.invoiceNumber ?? "" })}</DialogTitle>
            <DialogDescription>
              {completedOrder && formatDateTime(completedOrder.orderDate)} · {activeStore?.name}
            </DialogDescription>
          </DialogHeader>
          {completedOrder && <ReceiptView order={completedOrder} />}
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
