"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Printer, Search } from "lucide-react";

import { listReturns } from "@/lib/api/returns";
import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { PrintOnly } from "@/components/print-document";
import { ReportDocument } from "@/components/report-document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ReturnsHistoryPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { t } = useLocale();
  const [query, setQuery] = React.useState("");

  const { data: returns, isLoading } = useQuery({
    queryKey: ["returns", activeStoreId],
    queryFn: () => listReturns(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return returns ?? [];
    return (returns ?? []).filter((r) =>
      [r.returnNumber, r.originalOrder?.invoiceNumber, r.customer?.name, r.customer?.phone, r.processedBy?.fullName].some(
        (f) => f?.toLowerCase().includes(q),
      ),
    );
  }, [returns, query]);

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("returns.historyTitle")} description={t("returns.historyDescription")} />
        <NoStoreSelected />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("returns.historyTitle")}
        description={activeStore?.name}
        actions={
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" />
            {t("exports.formatPrint")}
          </Button>
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
              <TableHead>{t("returns.colNumber")}</TableHead>
              <TableHead>{t("returns.colDate")}</TableHead>
              <TableHead>{t("returns.colInvoice")}</TableHead>
              <TableHead>{t("returns.colType")}</TableHead>
              <TableHead>{t("returns.colCustomer")}</TableHead>
              <TableHead>{t("returns.colProcessedBy")}</TableHead>
              <TableHead className="text-end">{t("returns.colTotal")}</TableHead>
              <TableHead className="text-end">{t("returns.colBalance")}</TableHead>
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
                  {t("returns.noReturns")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <Link href={`/sales/returns/${r.id}`} className="font-mono text-xs hover:underline">
                      {r.returnNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDateTime(r.returnDate)}</TableCell>
                  <TableCell>
                    {r.originalOrder ? (
                      <Link href={`/sales/${r.originalOrderId}`} className="font-mono text-xs hover:underline">
                        {r.originalOrder.invoiceNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.type === "exchange" ? "secondary" : "outline"}>
                      {t(r.type === "exchange" ? "returns.typeExchange" : "returns.typeRefund")}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.customer?.name ?? t("salesHistory.walkIn")}</TableCell>
                  <TableCell>{r.processedBy?.fullName ?? "—"}</TableCell>
                  <TableCell className="text-end font-medium">
                    {formatMoney(r.refundTotal, activeStore?.currency)}
                  </TableCell>
                  <TableCell className="text-end">
                    {formatMoney(Math.abs(Number(r.balanceDue)), activeStore?.currency)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PrintOnly variant="report">
        <ReportDocument
          store={activeStore}
          title={t("reportDoc.returnsTitle")}
          subtitle={query.trim() ? query : undefined}
          emptyLabel={t("returns.noReturns")}
          columns={[
            { key: "number", label: t("returns.colNumber") },
            { key: "date", label: t("returns.colDate") },
            { key: "invoice", label: t("returns.colInvoice") },
            { key: "type", label: t("returns.colType") },
            { key: "customer", label: t("returns.colCustomer") },
            { key: "processedBy", label: t("returns.colProcessedBy") },
            { key: "refunded", label: t("returns.colTotal"), align: "end" },
            { key: "balance", label: t("returns.colBalance"), align: "end" },
          ]}
          rows={filtered.map((r) => ({
            number: r.returnNumber,
            date: formatDateTime(r.returnDate),
            invoice: r.originalOrder?.invoiceNumber ?? "—",
            type: t(r.type === "exchange" ? "returns.typeExchange" : "returns.typeRefund"),
            customer: r.customer?.name ?? t("salesHistory.walkIn"),
            processedBy: r.processedBy?.fullName ?? "—",
            refunded: formatMoney(r.refundTotal, activeStore?.currency),
            balance: formatMoney(Math.abs(Number(r.balanceDue)), activeStore?.currency),
          }))}
          totals={[
            {
              label: t("returns.colTotal"),
              value: formatMoney(
                filtered.reduce((sum, r) => sum + Number(r.refundTotal), 0),
                activeStore?.currency,
              ),
            },
          ]}
        />
      </PrintOnly>
    </div>
  );
}
