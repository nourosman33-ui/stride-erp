"use client";

import { useQuery } from "@tanstack/react-query";

import { getReorderAlerts } from "@/lib/api/inventory";
import { useActiveStore } from "@/lib/store-context";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ReorderAlertsPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["reorder-alerts", activeStoreId],
    queryFn: () => getReorderAlerts(activeStoreId!),
    enabled: !!activeStoreId,
  });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title="Reorder Alerts" description="Variants at or below their reorder point" />
        <NoStoreSelected />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reorder Alerts"
        description={activeStore ? `${activeStore.name} — restock these before they run out` : undefined}
      />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead className="text-right">On hand</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : !alerts || alerts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nothing is below its reorder point right now.
                </TableCell>
              </TableRow>
            ) : (
              alerts.map((row) => (
                <TableRow key={row.variantId}>
                  <TableCell className="font-medium">{row.productName ?? "—"}</TableCell>
                  <TableCell>{row.color ?? "—"}</TableCell>
                  <TableCell>{row.size ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.barcode ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="warning">{formatNumber(row.quantityOnHand)}</Badge>
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
