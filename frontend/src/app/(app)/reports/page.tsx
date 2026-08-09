"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Package, ShoppingCart, Truck, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { getReorderAlerts, getTotalInventoryValue, listStockOnHand } from "@/lib/api/inventory";
import { listPurchaseOrders } from "@/lib/api/purchasing";
import { listSuppliers } from "@/lib/api/suppliers";
import { listProducts } from "@/lib/api/catalog";
import { formatMoney, formatNumber } from "@/lib/format";
import { CATEGORICAL, CHART_INK, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_LABEL_STYLE } from "@/lib/chart-colors";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PoStatus } from "@/lib/api/types";

export default function ReportsPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { t } = useLocale();

  const { data: stock, isLoading: stockLoading } = useQuery({
    queryKey: ["stock-on-hand", activeStoreId],
    queryFn: () => listStockOnHand(activeStoreId!),
    enabled: !!activeStoreId,
  });
  const { data: inventoryValue } = useQuery({
    queryKey: ["inventory-value", activeStoreId],
    queryFn: () => getTotalInventoryValue(activeStoreId!),
    enabled: !!activeStoreId,
  });
  const { data: reorderAlerts } = useQuery({
    queryKey: ["reorder-alerts", activeStoreId],
    queryFn: () => getReorderAlerts(activeStoreId!),
    enabled: !!activeStoreId,
  });
  const { data: purchaseOrders } = useQuery({
    queryKey: ["purchase-orders", activeStoreId],
    queryFn: () => listPurchaseOrders(activeStoreId!),
    enabled: !!activeStoreId,
  });
  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: listSuppliers });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: listProducts });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("reports.title")} description={t("reports.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  const topValueProducts = [...(stock ?? [])]
    .sort((a, b) => (b.inventoryValue ?? 0) - (a.inventoryValue ?? 0))
    .slice(0, 10)
    .map((row) => ({
      name: `${row.productName ?? "—"} (${row.color ?? ""}/${row.size ?? ""})`,
      value: row.inventoryValue ?? 0,
    }));

  const POSTATUSES: PoStatus[] = ["draft", "pending_approval", "approved", "partially_received", "received", "cancelled"];
  const poByStatus = POSTATUSES.map((status, i) => ({
    label: t(`status.${status}`),
    count: purchaseOrders?.filter((po) => po.status === status).length ?? 0,
    color: CATEGORICAL[i % CATEGORICAL.length],
  })).filter((d) => d.count > 0);

  const orderTotal = (purchaseOrders ?? []).reduce(
    (sum, po) => sum + (po.lines ?? []).reduce((s, l) => s + Number(l.lineTotal), 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("reports.title")}
        description={activeStore ? t("reports.descriptionWithStore", { store: activeStore.name }) : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t("reports.inventoryValue")}
          value={formatMoney(inventoryValue?.totalInventoryValue ?? 0, activeStore?.currency)}
          icon={Wallet}
        />
        <StatTile
          label={t("reports.reorderAlerts")}
          value={formatNumber(reorderAlerts?.length ?? 0)}
          icon={AlertTriangle}
          tone={reorderAlerts && reorderAlerts.length > 0 ? "warning" : "default"}
        />
        <StatTile
          label={t("reports.totalPoValue")}
          value={formatMoney(orderTotal, activeStore?.currency)}
          icon={ShoppingCart}
          hint={`${purchaseOrders?.length ?? 0} ${t("reports.ordersSuffix")}`}
        />
        <StatTile label={t("reports.suppliersProducts")} value={`${suppliers?.length ?? 0} / ${products?.length ?? 0}`} icon={Truck} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.topProducts")}</CardTitle>
          </CardHeader>
          <CardContent>
            {stockLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : topValueProducts.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">{t("reports.noStockYet")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topValueProducts} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid horizontal={false} stroke={CHART_INK.gridline} />
                  <XAxis type="number" stroke={CHART_INK.muted} fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={160}
                    stroke={CHART_INK.muted}
                    fontSize={11}
                    tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    formatter={(value) => formatMoney(value as number, activeStore?.currency)}
                    contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  />
                  <Bar dataKey="value" fill={CATEGORICAL[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.poByStatus")}</CardTitle>
          </CardHeader>
          <CardContent>
            {poByStatus.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">{t("reports.noOrdersYet")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={poByStatus} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} stroke={CHART_INK.gridline} />
                  <XAxis dataKey="label" stroke={CHART_INK.muted} fontSize={11} />
                  <YAxis allowDecimals={false} stroke={CHART_INK.muted} fontSize={12} />
                  <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40} fill={CATEGORICAL[0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="size-4" />
            {t("reports.reorderDetail")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("reports.colProduct")}</TableHead>
                <TableHead>{t("reports.colColorSize")}</TableHead>
                <TableHead>{t("reports.colBarcode")}</TableHead>
                <TableHead className="text-end">{t("reports.colOnHand")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!reorderAlerts || reorderAlerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    {t("reports.nothingBelow")}
                  </TableCell>
                </TableRow>
              ) : (
                reorderAlerts.map((row) => (
                  <TableRow key={row.variantId}>
                    <TableCell className="font-medium">{row.productName ?? "—"}</TableCell>
                    <TableCell>
                      {row.color ?? "—"} / {row.size ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.barcode ?? "—"}</TableCell>
                    <TableCell className="text-end">{row.quantityOnHand}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
