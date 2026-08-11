"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";

import { getSale } from "@/lib/api/sales";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { ReceiptView } from "@/components/receipt-view";
import { Printable } from "@/components/print-document";
import { SalesOrderStatusBadge } from "@/components/status-badge";
import { PAYMENT_METHOD_KEY } from "@/lib/payment-methods";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function SaleDetailPage() {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const { data: order, isLoading } = useQuery({
    queryKey: ["sale", orderId],
    queryFn: () => getSale(orderId),
  });

  if (isLoading || !order) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("salesHistory.detailTitle", { invoice: order.invoiceNumber })}
        description={formatDateTime(order.orderDate)}
        actions={
          <div className="flex items-center gap-2">
            <SalesOrderStatusBadge status={order.status} />
            <Button variant="outline" size="sm" asChild>
              <Link href="/sales">
                <ArrowLeft className="size-4" />
                {t("salesHistory.backToList")}
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("salesHistory.orderInfo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("salesHistory.colStore")}</span>
              <span>{order.store?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("salesHistory.colCashier")}</span>
              <span>{order.cashier?.fullName ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("salesHistory.colCustomer")}</span>
              <span>{order.customer ? `${order.customer.name} · ${order.customer.phone ?? ""}` : t("salesHistory.walkIn")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("salesHistory.colPayment")}</span>
              <span>{order.payments?.map((p) => t(PAYMENT_METHOD_KEY[p.method])).join(", ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("receipt.subtotal")}</span>
              <span>{formatMoney(order.subtotal, order.store?.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("receipt.discount")}</span>
              <span>-{formatMoney(order.discountTotal, order.store?.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("receipt.vat")}</span>
              <span>{formatMoney(order.taxTotal, order.store?.currency)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>{t("receipt.grandTotal")}</span>
              <span>{formatMoney(order.grandTotal, order.store?.currency)}</span>
            </div>
            {order.pointsEarned > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("receipt.pointsEarned")}</span>
                <span>+{order.pointsEarned}</span>
              </div>
            )}
            {order.pointsRedeemed > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("receipt.pointsRedeemed")}</span>
                <span>-{order.pointsRedeemed}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("salesHistory.receiptPreview")}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" />
              {t("common.print")}
            </Button>
          </CardHeader>
          <CardContent>
            <Printable>
              <ReceiptView order={order} />
            </Printable>
          </CardContent>
        </Card>
      </div>

      {order.returns && order.returns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("returns.ordersWithReturns")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("returns.ordersWithReturnsHint")}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.returns.map((r) => (
              <Link
                key={r.id}
                href={`/sales/returns/${r.id}`}
                className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-accent"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{r.returnNumber}</span>
                  <Badge variant={r.type === "exchange" ? "secondary" : "outline"}>
                    {t(r.type === "exchange" ? "returns.typeExchange" : "returns.typeRefund")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTime(r.returnDate)}</span>
                </div>
                <span className="font-medium">{formatMoney(r.refundTotal, order.store?.currency)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
