"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Printer, Search } from "lucide-react";

import { listSales } from "@/lib/api/sales";
import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { ExportButton } from "@/components/export-button";
import { NoStoreSelected } from "@/components/no-store-selected";
import { SalesOrderStatusBadge } from "@/components/status-badge";
import { PrintOnly } from "@/components/print-document";
import { ReportDocument } from "@/components/report-document";
import { PAYMENT_METHOD_KEY } from "@/lib/payment-methods";
import { toNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function SalesHistoryPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { t } = useLocale();
  const [query, setQuery] = React.useState("");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["sales", activeStoreId],
    queryFn: () => listSales(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders ?? [];
    return (orders ?? []).filter((o) =>
      [o.invoiceNumber, o.customer?.name, o.customer?.phone, o.cashier?.fullName].some((f) =>
        f?.toLowerCase().includes(q),
      ),
    );
  }, [orders, query]);

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("salesHistory.title")} description={t("salesHistory.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("salesHistory.title")}
        description={activeStore?.name}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" />
              {t("exports.formatPrint")}
            </Button>
            <ExportButton kind="sales" storeId={activeStoreId} />
          </div>
        }
      />

      <div className="relative max-w-md">
        <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("salesHistory.searchPlaceholder")}
          className="ps-9"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("salesHistory.colInvoice")}</TableHead>
              <TableHead>{t("salesHistory.colDate")}</TableHead>
              <TableHead>{t("salesHistory.colCustomer")}</TableHead>
              <TableHead>{t("salesHistory.colCashier")}</TableHead>
              <TableHead>{t("salesHistory.colPayment")}</TableHead>
              <TableHead>{t("salesHistory.colStatus")}</TableHead>
              <TableHead className="text-end">{t("salesHistory.colTotal")}</TableHead>
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
                  {t("salesHistory.noSales")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">
                    <Link href={`/sales/${o.id}`} className="font-mono text-xs hover:underline">
                      {o.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDateTime(o.orderDate)}</TableCell>
                  <TableCell>{o.customer?.name ?? t("salesHistory.walkIn")}</TableCell>
                  <TableCell>{o.cashier?.fullName ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {o.payments?.map((p) => t(PAYMENT_METHOD_KEY[p.method])).join(", ")}
                  </TableCell>
                  <TableCell>
                    <SalesOrderStatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="text-end font-medium">{formatMoney(o.grandTotal, activeStore?.currency)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PrintOnly variant="report">
        <ReportDocument
          store={activeStore}
          title={t("reportDoc.salesTitle")}
          subtitle={query.trim() ? query : undefined}
          emptyLabel={t("salesHistory.noSales")}
          columns={[
            { key: "invoice", label: t("salesHistory.colInvoice") },
            { key: "date", label: t("salesHistory.colDate") },
            { key: "customer", label: t("salesHistory.colCustomer") },
            { key: "cashier", label: t("salesHistory.colCashier") },
            { key: "payment", label: t("salesHistory.colPayment") },
            { key: "status", label: t("salesHistory.colStatus") },
            { key: "total", label: t("salesHistory.colTotal"), align: "end" },
          ]}
          rows={filtered.map((o) => ({
            invoice: o.invoiceNumber,
            date: formatDateTime(o.orderDate),
            customer: o.customer?.name ?? t("salesHistory.walkIn"),
            cashier: o.cashier?.fullName ?? "—",
            payment: o.payments?.map((p) => t(PAYMENT_METHOD_KEY[p.method])).join(", ") ?? "",
            status: t(`status.${o.status}`),
            total: formatMoney(o.grandTotal, activeStore?.currency),
          }))}
          totals={[
            {
              label: t("reportDoc.totalLabel"),
              value: formatMoney(
                filtered.reduce((sum, o) => sum + toNumber(o.grandTotal), 0),
                activeStore?.currency,
              ),
            },
          ]}
        />
      </PrintOnly>
    </div>
  );
}
