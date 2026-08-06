"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { listStockOnHand } from "@/lib/api/inventory";
import { useActiveStore } from "@/lib/store-context";
import { formatMoney, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function StockOnHandPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const [search, setSearch] = React.useState("");

  const { data: stock, isLoading } = useQuery({
    queryKey: ["stock-on-hand", activeStoreId],
    queryFn: () => listStockOnHand(activeStoreId!),
    enabled: !!activeStoreId,
  });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title="Stock on Hand" description="Derived from the append-only stock ledger" />
        <NoStoreSelected />
      </div>
    );
  }

  const filtered = (stock ?? []).filter((row) =>
    [row.productName, row.barcode, row.color].some((f) => f?.toLowerCase().includes(search.toLowerCase())),
  );

  const totalValue = (stock ?? []).reduce((sum, r) => sum + (r.inventoryValue ?? 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock on Hand"
        description={activeStore ? `${activeStore.name} — total value ${formatMoney(totalValue, activeStore.currency)}` : undefined}
      />

      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product, color or barcode…"
          className="pl-8"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead className="text-right">Qty on hand</TableHead>
              <TableHead className="text-right">Avg unit cost</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No stock recorded for this store yet — receive a purchase order to populate it.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.variantId}>
                  <TableCell className="font-medium">{row.productName ?? "—"}</TableCell>
                  <TableCell>{row.color ?? "—"}</TableCell>
                  <TableCell>{row.size ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.barcode ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={row.quantityOnHand <= 0 ? "destructive" : "outline"}>
                      {formatNumber(row.quantityOnHand)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.avgUnitCost !== null ? formatMoney(row.avgUnitCost, activeStore?.currency) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {row.inventoryValue !== null ? formatMoney(row.inventoryValue, activeStore?.currency) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
