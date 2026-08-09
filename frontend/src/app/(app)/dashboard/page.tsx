"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Package,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { getReorderAlerts, getTotalInventoryValue } from "@/lib/api/inventory";
import { listPurchaseOrders } from "@/lib/api/purchasing";
import { listSuppliers } from "@/lib/api/suppliers";
import { listProducts } from "@/lib/api/catalog";
import { formatMoney, formatNumber } from "@/lib/format";
import { PO_STATUS_COLOR, CHART_INK, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_LABEL_STYLE } from "@/lib/chart-colors";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { PoStatus } from "@/lib/api/types";

const PO_STATUSES: PoStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "partially_received",
  "received",
  "cancelled",
];

export default function DashboardPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { t } = useLocale();

  const { data: inventoryValue, isLoading: valueLoading } = useQuery({
    queryKey: ["inventory-value", activeStoreId],
    queryFn: () => getTotalInventoryValue(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const { data: reorderAlerts, isLoading: alertsLoading } = useQuery({
    queryKey: ["reorder-alerts", activeStoreId],
    queryFn: () => getReorderAlerts(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const { data: purchaseOrders, isLoading: poLoading } = useQuery({
    queryKey: ["purchase-orders", activeStoreId],
    queryFn: () => listPurchaseOrders(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const { data: suppliers, isLoading: suppliersLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: listSuppliers,
  });

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["products"],
    queryFn: listProducts,
  });

  const poStatusData = PO_STATUSES.map((status) => ({
    status,
    label: t(`status.${status}`),
    count: purchaseOrders?.filter((po) => po.status === status).length ?? 0,
  })).filter((d) => d.count > 0);

  const openPoCount =
    purchaseOrders?.filter((po) => !["received", "cancelled"].includes(po.status)).length ?? 0;

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("dashboard.title")} description={t("common.noStoreDesc")} />
        <NoStoreSelected />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.title")}
        description={activeStore ? t("dashboard.liveSnapshot", { store: activeStore.name }) : t("dashboard.loading")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t("dashboard.inventoryValue")}
          value={
            valueLoading
              ? "…"
              : formatMoney(inventoryValue?.totalInventoryValue ?? 0, activeStore?.currency)
          }
          icon={Wallet}
        />
        <StatTile
          label={t("dashboard.reorderAlerts")}
          value={alertsLoading ? "…" : formatNumber(reorderAlerts?.length ?? 0)}
          icon={AlertTriangle}
          tone={reorderAlerts && reorderAlerts.length > 0 ? "warning" : "default"}
          hint={t("dashboard.reorderAlertsHint")}
        />
        <StatTile
          label={t("dashboard.openPurchaseOrders")}
          value={poLoading ? "…" : formatNumber(openPoCount)}
          icon={ShoppingCart}
          hint={t("dashboard.openPoHint")}
        />
        <StatTile
          label={t("dashboard.activeSuppliers")}
          value={suppliersLoading ? "…" : formatNumber(suppliers?.length ?? 0)}
          icon={Truck}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.poByStatus")}</CardTitle>
          </CardHeader>
          <CardContent>
            {poLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : poStatusData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {t("dashboard.noPoYet")}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={poStatusData} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid horizontal={false} stroke={CHART_INK.gridline} />
                  <XAxis type="number" allowDecimals={false} stroke={CHART_INK.muted} fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    stroke={CHART_INK.muted}
                    fontSize={12}
                    width={110}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {poStatusData.map((entry) => (
                      <Cell key={entry.status} fill={PO_STATUS_COLOR[entry.status]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.reorderAlertsCard")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alertsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !reorderAlerts || reorderAlerts.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {t("dashboard.nothingBelowReorder")}
              </p>
            ) : (
              <>
                <ul className="divide-y">
                  {reorderAlerts.slice(0, 6).map((row) => (
                    <li key={row.variantId} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <p className="font-medium">{row.productName ?? row.variantId}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.color} · {row.size} · {row.barcode}
                        </p>
                      </div>
                      <span className="font-medium text-warning">
                        {row.quantityOnHand} {t("dashboard.leftSuffix")}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant="ghost" size="sm" className="w-full justify-between">
                  <Link href="/inventory/reorder-alerts">
                    {t("dashboard.viewAllAlerts", { count: reorderAlerts.length })}
                    <ArrowRight className="size-4 rtl:rotate-180" />
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          label={t("dashboard.productsInCatalog")}
          value={productsLoading ? "…" : formatNumber(products?.length ?? 0)}
          icon={Package}
        />
        <StatTile
          label={t("dashboard.currency")}
          value={activeStore?.currency ?? "—"}
          icon={Wallet}
          hint={activeStore ? t("dashboard.vatSuffix", { rate: activeStore.vatRate }) : undefined}
        />
      </div>
    </div>
  );
}
