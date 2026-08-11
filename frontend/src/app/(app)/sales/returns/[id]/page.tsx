"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";

import { getReturn } from "@/lib/api/returns";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { ReturnReceiptView } from "@/components/return-receipt-view";
import { Printable } from "@/components/print-document";
import { PAYMENT_METHOD_KEY } from "@/lib/payment-methods";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function ReturnDetailPage() {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const returnId = params.id;

  const { data: salesReturn, isLoading } = useQuery({
    queryKey: ["return", returnId],
    queryFn: () => getReturn(returnId),
  });

  if (isLoading || !salesReturn) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const isExchange = salesReturn.type === "exchange";

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("returns.receiptTitle", { number: salesReturn.returnNumber })}
        description={formatDateTime(salesReturn.returnDate)}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={isExchange ? "secondary" : "outline"}>
              {t(isExchange ? "returns.typeExchange" : "returns.typeRefund")}
            </Badge>
            <Button variant="outline" size="sm" asChild>
              <Link href="/sales/returns">
                <ArrowLeft className="size-4" />
                {t("returns.backToHistory")}
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
              <span className="text-muted-foreground">{t("returns.colInvoice")}</span>
              <span>
                {salesReturn.originalOrder ? (
                  <Link href={`/sales/${salesReturn.originalOrderId}`} className="font-mono text-xs hover:underline">
                    {salesReturn.originalOrder.invoiceNumber}
                  </Link>
                ) : (
                  "—"
                )}
              </span>
            </div>
            {salesReturn.exchangeOrder && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("returns.receiptExchangedItems")}</span>
                <span>
                  <Link href={`/sales/${salesReturn.exchangeOrder.id}`} className="font-mono text-xs hover:underline">
                    {salesReturn.exchangeOrder.invoiceNumber}
                  </Link>
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("returns.colProcessedBy")}</span>
              <span>{salesReturn.processedBy?.fullName ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("returns.colCustomer")}</span>
              <span>
                {salesReturn.customer
                  ? `${salesReturn.customer.name} · ${salesReturn.customer.phone ?? ""}`
                  : t("salesHistory.walkIn")}
              </span>
            </div>
            {salesReturn.reason && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("returns.reason")}</span>
                <span>{salesReturn.reason}</span>
              </div>
            )}
            {salesReturn.refundMethod && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("receipt.paymentMethod")}</span>
                <span>{t(PAYMENT_METHOD_KEY[salesReturn.refundMethod])}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("receipt.subtotal")}</span>
              <span>-{formatMoney(salesReturn.refundSubtotal, salesReturn.store?.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("receipt.vat")}</span>
              <span>-{formatMoney(salesReturn.refundTaxTotal, salesReturn.store?.currency)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>{t("returns.receiptRefunded")}</span>
              <span>-{formatMoney(salesReturn.refundTotal, salesReturn.store?.currency)}</span>
            </div>
            {Number(salesReturn.exchangeTotal) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("returns.receiptExchanged")}</span>
                <span>{formatMoney(salesReturn.exchangeTotal, salesReturn.store?.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <span>
                {Number(salesReturn.balanceDue) > 0 ? t("returns.balanceDue") : t("returns.balanceRefund")}
              </span>
              <span>{formatMoney(Math.abs(Number(salesReturn.balanceDue)), salesReturn.store?.currency)}</span>
            </div>
            {salesReturn.pointsAdjusted !== 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("returns.pointsAdjust")}</span>
                <span>
                  {salesReturn.pointsAdjusted > 0 ? "+" : ""}
                  {salesReturn.pointsAdjusted}
                </span>
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
              <ReturnReceiptView salesReturn={salesReturn} />
            </Printable>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
