import type { LoyaltyTier, SalesOrder } from "@/lib/api/types";
import { useLocale, type TranslationKey } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_KEY } from "@/lib/payment-methods";

/**
 * Full professional receipt — shared by the POS post-checkout dialog and the
 * Sales History detail view, so the two never drift out of sync (spec section 9).
 * `loyaltySnapshot` is only guaranteed fresh on the immediate checkout response;
 * for historical views pass the customer's current balance/tier if known.
 */
export function ReceiptView({
  order,
  loyaltySnapshot,
}: {
  order: SalesOrder;
  loyaltySnapshot?: { pointsBalance: number; tier: LoyaltyTier } | null;
}) {
  const { t } = useLocale();
  const store = order.store;
  const snapshot = loyaltySnapshot !== undefined ? loyaltySnapshot : order.loyaltySnapshot;
  const currency = store?.currency;

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
      </div>

      <div className="space-y-0.5 border-y py-2 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>{t("receipt.receiptNumber")}</span>
          <span className="font-mono text-foreground">{order.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("receipt.dateTime")}</span>
          <span className="text-foreground">{formatDateTime(order.orderDate)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("receipt.cashier")}</span>
          <span className="text-foreground">{order.cashier?.fullName ?? "—"}</span>
        </div>
        {order.customer && (
          <div className="flex justify-between">
            <span>{t("receipt.customer")}</span>
            <span className="text-foreground">
              {order.customer.name}
              {order.customer.phone ? ` · ${order.customer.phone}` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {order.lines?.map((line) => (
          <div key={line.id} className="flex justify-between gap-2">
            <div>
              <p className="font-medium">{line.variant?.product?.modelName ?? t("receipt.item")}</p>
              <p className="text-xs text-muted-foreground">
                {line.variant?.color?.name} · {line.variant?.sizeValue?.value} × {line.quantity}
                {Number(line.discountAmount) > 0 && ` · -${formatMoney(line.discountAmount, currency)}`}
              </p>
            </div>
            <span className="shrink-0 tabular-nums">{formatMoney(line.netPrice, currency)}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1 border-t pt-2">
        <div className="flex justify-between text-muted-foreground">
          <span>{t("receipt.subtotal")}</span>
          <span className="tabular-nums">{formatMoney(order.subtotal, currency)}</span>
        </div>
        {Number(order.discountTotal) > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>{t("receipt.discount")}</span>
            <span className="tabular-nums">-{formatMoney(order.discountTotal, currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <span>{t("receipt.vat")}</span>
          <span className="tabular-nums">{formatMoney(order.taxTotal, currency)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>{t("receipt.grandTotal")}</span>
          <span className="tabular-nums">{formatMoney(order.grandTotal, currency)}</span>
        </div>
      </div>

      <div className="space-y-1 border-t pt-2 text-muted-foreground">
        <div className="flex justify-between">
          <span>{t("receipt.paymentMethod")}</span>
          <span className="text-foreground">
            {order.payments?.map((p) => t(PAYMENT_METHOD_KEY[p.method] ?? "pos.methodCash")).join(", ") || "—"}
          </span>
        </div>
        {order.amountTendered !== null && order.amountTendered !== undefined && (
          <div className="flex justify-between">
            <span>{t("receipt.amountPaid")}</span>
            <span className="tabular-nums text-foreground">{formatMoney(order.amountTendered, currency)}</span>
          </div>
        )}
        {Number(order.changeDue) > 0 && (
          <div className="flex justify-between">
            <span>{t("receipt.change")}</span>
            <span className="tabular-nums text-foreground">{formatMoney(order.changeDue, currency)}</span>
          </div>
        )}
      </div>

      {order.customer && (order.pointsEarned > 0 || order.pointsRedeemed > 0 || snapshot) && (
        <div className="space-y-1 border-t pt-2 text-muted-foreground">
          {order.pointsEarned > 0 && (
            <div className="flex justify-between">
              <span>{t("receipt.pointsEarned")}</span>
              <span className="text-foreground">+{order.pointsEarned}</span>
            </div>
          )}
          {order.pointsRedeemed > 0 && (
            <div className="flex justify-between">
              <span>{t("receipt.pointsRedeemed")}</span>
              <span className="text-foreground">-{order.pointsRedeemed}</span>
            </div>
          )}
          {snapshot && (
            <>
              <div className="flex justify-between">
                <span>{t("receipt.currentPoints")}</span>
                <span className="text-foreground">{snapshot.pointsBalance}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("receipt.currentTier")}</span>
                <span className="text-foreground">{t(`loyaltyTiers.${snapshot.tier}` as TranslationKey)}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-0.5 border-t pt-2 text-center text-xs text-muted-foreground">
        <p>{store?.receiptFooterLine1 || t("receipt.defaultFooter1")}</p>
        <p>{store?.receiptFooterLine2 || t("receipt.defaultFooter2")}</p>
      </div>
    </div>
  );
}
