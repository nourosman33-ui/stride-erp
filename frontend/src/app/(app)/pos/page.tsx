"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Minus, Plus, ScanBarcode, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useActiveStore } from "@/lib/store-context";
import { useVariantCatalog, type FlatVariant } from "@/lib/hooks/use-variant-catalog";
import { listStockOnHand } from "@/lib/api/inventory";
import { formatMoney, toNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CartLine {
  variant: FlatVariant;
  quantity: number;
}

export default function PosPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { variants, isLoading: variantsLoading } = useVariantCatalog();
  const { data: stock } = useQuery({
    queryKey: ["stock-on-hand", activeStoreId],
    queryFn: () => listStockOnHand(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const stockMap = React.useMemo(() => {
    const map = new Map<string, number>();
    (stock ?? []).forEach((row) => map.set(row.variantId, row.quantityOnHand));
    return map;
  }, [stock]);

  const [query, setQuery] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [discountPct, setDiscountPct] = React.useState(0);
  const [receiptOpen, setReceiptOpen] = React.useState(false);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return variants
      .filter((v) => v.isActive)
      .filter((v) =>
        [v.productName, v.colorName, v.sizeLabel, v.barcode].some((f) => f.toLowerCase().includes(q)),
      )
      .slice(0, 20);
  }, [variants, query]);

  function addToCart(variant: FlatVariant) {
    setCart((prev) => {
      const existing = prev.find((l) => l.variant.variantId === variant.variantId);
      if (existing) {
        return prev.map((l) =>
          l.variant.variantId === variant.variantId ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { variant, quantity: 1 }];
    });
    const onHand = stockMap.get(variant.variantId) ?? 0;
    if (onHand <= 0) {
      toast.warning(`${variant.productName} shows 0 on hand for this store.`);
    }
  }

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const exact = variants.find((v) => v.barcode === query.trim());
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
        .map((l) => (l.variant.variantId === variantId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(variantId: string) {
    setCart((prev) => prev.filter((l) => l.variant.variantId !== variantId));
  }

  const subtotal = cart.reduce((sum, l) => sum + l.variant.sellingPrice * l.quantity, 0);
  const discountLimit = toNumber(activeStore?.discountApprovalLimitPct ?? 10);
  const discountAmount = subtotal * (discountPct / 100);
  const vatRate = toNumber(activeStore?.vatRate ?? 14);
  const taxableAmount = subtotal - discountAmount;
  const vatAmount = taxableAmount * (vatRate / 100);
  const total = taxableAmount + vatAmount;
  const needsApproval = discountPct > discountLimit;

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title="Point of Sale" description="Scan or search to build a sale" />
        <NoStoreSelected />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Point of Sale" description={activeStore?.name} />

      <Alert>
        <ScanBarcode />
        <AlertTitle>Preview only</AlertTitle>
        <AlertDescription>
          Search, cart and pricing here run against your real catalog and live stock. Checkout does not post a
          sale — STRIDE&apos;s backend does not have a Sales/POS module yet (see Roadmap Phase 2), so
          &ldquo;Complete Sale&rdquo; only shows a receipt preview and does not touch inventory.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <form onSubmit={handleScanSubmit}>
            <div className="relative">
              <ScanBarcode className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Scan barcode or search by product, color, size…"
                className="h-11 pl-9 text-base"
                disabled={variantsLoading}
              />
            </div>
          </form>

          {query && (
            <Card>
              <CardContent className="p-2">
                {results.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No matches.</p>
                ) : (
                  <ScrollArea className="h-72">
                    <div className="space-y-1">
                      {results.map((v) => {
                        const onHand = stockMap.get(v.variantId) ?? 0;
                        return (
                          <button
                            key={v.variantId}
                            type="button"
                            onClick={() => {
                              addToCart(v);
                              setQuery("");
                            }}
                            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                          >
                            <div>
                              <p className="font-medium">{v.productName}</p>
                              <p className="text-xs text-muted-foreground">
                                {v.colorName} · {v.sizeLabel} · {v.barcode}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">{formatMoney(v.sellingPrice, activeStore?.currency)}</p>
                              <p
                                className={`text-xs ${onHand <= 0 ? "text-destructive" : "text-muted-foreground"}`}
                              >
                                {onHand} on hand
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cart</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {cart.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  <ShoppingCart className="mx-auto mb-2 size-8 text-muted-foreground/50" />
                  Cart is empty — search or scan an item to begin.
                </p>
              ) : (
                <div className="divide-y">
                  {cart.map((line) => {
                    const onHand = stockMap.get(line.variant.variantId) ?? 0;
                    const overselling = line.quantity > onHand;
                    return (
                      <div key={line.variant.variantId} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{line.variant.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.variant.colorName} · {line.variant.sizeLabel}
                          </p>
                          {overselling && (
                            <p className="flex items-center gap-1 text-xs text-destructive">
                              <AlertTriangle className="size-3" />
                              Only {onHand} on hand
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-7"
                            onClick={() => updateQuantity(line.variant.variantId, -1)}
                          >
                            <Minus className="size-3.5" />
                          </Button>
                          <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-7"
                            onClick={() => updateQuantity(line.variant.variantId, 1)}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                        <p className="w-24 text-right text-sm font-medium tabular-nums">
                          {formatMoney(line.variant.sellingPrice * line.quantity, activeStore?.currency)}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                          onClick={() => removeLine(line.variant.variantId)}
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
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatMoney(subtotal, activeStore?.currency)}</span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Discount %</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={discountPct}
                    onChange={(e) => setDiscountPct(Number(e.target.value))}
                    className="h-7 w-20 text-right"
                  />
                </div>
                {needsApproval && (
                  <p className="flex items-center gap-1 text-xs text-warning">
                    <AlertTriangle className="size-3" />
                    Above the {discountLimit}% limit — needs manager approval.
                  </p>
                )}
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VAT ({vatRate}%)</span>
                <span className="tabular-nums">{formatMoney(vatAmount, activeStore?.currency)}</span>
              </div>

              <Separator />

              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(total, activeStore?.currency)}</span>
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={cart.length === 0}
                onClick={() => setReceiptOpen(true)}
              >
                Complete Sale
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receipt preview</DialogTitle>
            <DialogDescription>
              This is a preview only — nothing was saved or deducted from inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {cart.map((line) => (
              <div key={line.variant.variantId} className="flex justify-between">
                <span>
                  {line.variant.productName} × {line.quantity}
                </span>
                <span className="tabular-nums">
                  {formatMoney(line.variant.sellingPrice * line.quantity, activeStore?.currency)}
                </span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span>
                {discountPct}% (-{formatMoney(discountAmount, activeStore?.currency)})
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>VAT</span>
              <span>{formatMoney(vatAmount, activeStore?.currency)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatMoney(total, activeStore?.currency)}</span>
            </div>
            {needsApproval && (
              <Badge variant="warning" className="w-full justify-center">
                Requires manager approval for discount
              </Badge>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setReceiptOpen(false);
                setCart([]);
                setDiscountPct(0);
                toast.success("Preview closed — cart cleared");
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
