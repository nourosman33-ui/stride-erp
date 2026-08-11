import type { SalesReturn } from "@/lib/api/returns";
import { useLocale, type TranslationKey } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_KEY } from "@/lib/payment-methods";
import { Badge } from "@/components/ui/badge";

/**
 * Refund/exchange receipt, deliberately built from the same visual language as
 * ReceiptView (store header, bordered sections, footer) so a customer holding this
 * next to their original sale receipt sees one consistent document, not two different
 * apps bolted together. Shared by the POS post-return dialog and the Returns History
 * detail page.
 */
export function ReturnReceiptView({ salesReturn: r }: { salesReturn: SalesReturn }) {
  const { t } = useLocale();
  const store = r.store;
  const currency = store?.currency;
  const isExchange = r.type === "exchange";

  return (
    <div className="mx-auto max-w-sm space-y-4 text-sm">
      <div className="flex flex-col items-center gap-1.5 text-center">
        {store?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logoUrl} alt="" className="mb-1 size-14 rounded object-cover" />
        )}
        <p className="text-base font-semibold">{store?.name}</p>
        {store?.address && <p className="text-xs text-muted-foreground">{store.address}</p>}
        {store?.phone && <p className="text-xs text-muted-foreground">{store.phone}</p>}
        {store?.taxNumber && (
          <p className="text-xs text-muted-foreground">
            {t("receipt.taxNumber")}: {store.taxNumber}
          </p>
        )}
        <Badge variant={isExchange ? "secondary" : "outline"} className="mt-1">
          {t(isExchange ? "returns.typeExchange" : "returns.typeRefund")}
        </Badge>
      </div>

      <div className="space-y-0.5 border-y py-2 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>{t("receipt.receiptNumber")}</span>
          <span className="font-mono text-foreground">{r.returnNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("returns.colInvoice")}</span>
          <span className="font-mono text-foreground">{r.originalOrder?.invoiceNumber ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("receipt.dateTime")}</span>
          <span className="text-foreground">{formatDateTime(r.returnDate)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("receipt.cashier")}</span>
          <span className="text-foreground">{r.processedBy?.fullName ?? "—"}</span>
        </div>
        {r.customer && (
          <div className="flex justify-between">
            <span>{t("receipt.customer")}</span>
            <span className="text-foreground">
              {r.customer.name}
              {r.customer.phone ? ` · ${r.customer.phone}` : ""}
            </span>
          </div>
        )}
        {r.reason && (
          <div className="flex justify-between">
            <span>{t("returns.reason")}</span>
            <span className="text-foreground">{r.reason}</span>
          </div>
        )}
      </div>

      {/* Returned items — negative, same visual weight as a normal receipt line. */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{t("returns.receiptReturnedItems")}</p>
        {r.lines?.map((line) => (
          <div key={line.id} className="flex justify-between gap-2">
            <div>
              <p className="font-medium">{line.variant?.product.modelName ?? t("receipt.item")}</p>
              <p className="text-xs text-muted-foreground">
                {line.variant?.color?.name} · {line.variant?.sizeValue?.value} × {line.quantity}
                {!line.restock && (
                  <Badge variant="destructive" className="ms-1.5 text-[10px]">
                    {t("returns.restockNo")}
                  </Badge>
                )}
              </p>
            </div>
            <span className="shrink-0 tabular-nums text-destructive">
              -{formatMoney(line.refundAmount, currency)}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-1 border-t pt-2">
        <div className="flex justify-between text-muted-foreground">
          <span>{t("receipt.subtotal")}</span>
          <span className="tabular-nums">-{formatMoney(r.refundSubtotal, currency)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>{t("receipt.vat")}</span>
          <span className="tabular-nums">-{formatMoney(r.refundTaxTotal, currency)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>{t("returns.receiptRefunded")}</span>
          <span className="tabular-nums">-{formatMoney(r.refundTotal, currency)}</span>
        </div>
      </div>

      {/* Replacement items — rendered exactly like a normal receipt's line items, because
          that is exactly what they are: a real sale, just paid for partly in trade-in. */}
      {isExchange && r.exchangeOrder && (
        <div className="space-y-2 border-t pt-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("returns.receiptExchangedItems")} — {r.exchangeOrder.invoiceNumber}
          </p>
          {r.exchangeOrder.lines?.map((line) => (
            <div key={line.id} className="flex justify-between gap-2">
              <div>
                <p className="font-medium">{line.variant?.product.modelName ?? t("receipt.item")}</p>
                <p className="text-xs text-muted-foreground">
                  {line.variant?.color?.name} · {line.variant?.sizeValue?.value} × {line.quantity}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">{formatMoney(line.netPrice, currency)}</span>
            </div>
          ))}
          <div className="flex justify-between text-base font-semibold">
            <span>{t("returns.receiptExchanged")}</span>
            <span className="tabular-nums">{formatMoney(r.exchangeTotal, currency)}</span>
          </div>
        </div>
      )}

      <div className="space-y-1 border-t pt-2">
        <div className="flex justify-between text-base font-semibold">
          <span>
            {Number(r.balanceDue) > 0 ? t("returns.balanceDue") : t("returns.balanceRefund")}
          </span>
          <span className="tabular-nums">{formatMoney(Math.abs(Number(r.balanceDue)), currency)}</span>
        </div>
        {r.refundMethod && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("receipt.paymentMethod")}</span>
            <span className="text-foreground">{t(PAYMENT_METHOD_KEY[r.refundMethod])}</span>
          </div>
        )}
      </div>

      {r.pointsAdjusted !== 0 && (
        <div className="flex justify-between border-t pt-2 text-xs text-muted-foreground">
          <span>{t("returns.pointsAdjust")}</span>
          <span className="text-foreground">
            {r.pointsAdjusted > 0 ? "+" : ""}
            {r.pointsAdjusted}
          </span>
        </div>
      )}

      {r.loyaltySnapshot && (
        <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>{t("receipt.currentPoints")}</span>
            <span className="text-foreground">{r.loyaltySnapshot.pointsBalance}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("receipt.currentTier")}</span>
            <span className="text-foreground">
              {t(`loyaltyTiers.${r.loyaltySnapshot.tier}` as TranslationKey)}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-0.5 border-t pt-2 text-center text-xs text-muted-foreground">
        <p>{store?.receiptFooterLine1 || t("receipt.defaultFooter1")}</p>
        <p>{store?.receiptFooterLine2 || t("receipt.defaultFooter2")}</p>
      </div>
    </div>
  );
}
