"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { listStockOnHand } from "@/lib/api/inventory";
import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatMoney, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { ExportButton } from "@/components/export-button";
import { FixCostDialog } from "@/components/fix-cost-dialog";
import { NoStoreSelected } from "@/components/no-store-selected";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function StockOnHandPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { t } = useLocale();
  const [search, setSearch] = React.useState("");

  const { data: stock, isLoading } = useQuery({
    queryKey: ["stock-on-hand", activeStoreId],
    queryFn: () => listStockOnHand(activeStoreId!),
    enabled: !!activeStoreId,
  });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("stock.title")} description={t("stock.description")} />
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
        title={t("stock.title")}
        description={
          activeStore
            ? t("stock.descriptionWithTotal", { store: activeStore.name, value: formatMoney(totalValue, activeStore.currency) })
            : undefined
        }
        actions={<ExportButton kind="stock" storeId={activeStoreId} />}
      />

      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("stock.searchPlaceholder")}
          className="ps-8"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("stock.colProduct")}</TableHead>
              <TableHead>{t("stock.colColor")}</TableHead>
              <TableHead>{t("stock.colSize")}</TableHead>
              <TableHead>{t("stock.colBarcode")}</TableHead>
              <TableHead className="text-end">{t("stock.colQtyOnHand")}</TableHead>
              <TableHead className="text-end">{t("stock.colAvgUnitCost")}</TableHead>
              <TableHead className="text-end">{t("stock.colValue")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {t("stock.noStock")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.variantId}>
                  <TableCell className="font-medium">{row.productName ?? "—"}</TableCell>
                  <TableCell>{row.color ?? "—"}</TableCell>
                  <TableCell>{row.size ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.barcode ?? "—"}</TableCell>
                  <TableCell className="text-end">
                    <Badge variant={row.quantityOnHand <= 0 ? "destructive" : "outline"}>
                      {formatNumber(row.quantityOnHand)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    {row.avgUnitCost !== null ? (
                      <span className={!row.avgUnitCost ? "text-destructive" : undefined}>
                        {formatMoney(row.avgUnitCost, activeStore?.currency)}
                      </span>
                    ) : (
                      <span className="text-destructive">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-end font-medium">
                    {row.inventoryValue !== null ? formatMoney(row.inventoryValue, activeStore?.currency) : "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    {activeStoreId && (
                      <FixCostDialog
                        row={row}
                        storeId={activeStoreId}
                        currency={activeStore?.currency}
                      />
                    )}
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
