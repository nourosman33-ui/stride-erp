"use client";

import { useQuery } from "@tanstack/react-query";

import { getReorderAlerts } from "@/lib/api/inventory";
import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ReorderAlertsPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { t } = useLocale();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["reorder-alerts", activeStoreId],
    queryFn: () => getReorderAlerts(activeStoreId!),
    enabled: !!activeStoreId,
  });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("reorderAlerts.title")} description={t("reorderAlerts.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("reorderAlerts.title")}
        description={activeStore ? t("reorderAlerts.descriptionWithStore", { store: activeStore.name }) : undefined}
      />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("reorderAlerts.colProduct")}</TableHead>
              <TableHead>{t("reorderAlerts.colColor")}</TableHead>
              <TableHead>{t("reorderAlerts.colSize")}</TableHead>
              <TableHead>{t("reorderAlerts.colBarcode")}</TableHead>
              <TableHead className="text-end">{t("reorderAlerts.colOnHand")}</TableHead>
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
                  {t("reorderAlerts.nothingBelow")}
                </TableCell>
              </TableRow>
            ) : (
              alerts.map((row) => (
                <TableRow key={row.variantId}>
                  <TableCell className="font-medium">{row.productName ?? "—"}</TableCell>
                  <TableCell>{row.color ?? "—"}</TableCell>
                  <TableCell>{row.size ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.barcode ?? "—"}</TableCell>
                  <TableCell className="text-end">
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
