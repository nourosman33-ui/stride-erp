"use client";

import type { CashFlowSummary, DailyClosingSummary } from "@/lib/api/financial-dashboard";
import type { Store } from "@/lib/api/types";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { PAYMENT_METHOD_KEY } from "@/lib/payment-methods";

function Row({
  label,
  value,
  emphasis,
  indent,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex justify-between py-1 ${emphasis ? "border-t font-semibold" : ""} ${
        indent ? "ps-4 text-muted-foreground" : ""
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="print-keep-together space-y-0.5">
      <p className="border-b pb-1 text-sm font-semibold uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

/**
 * The end-of-day artifact a cashier hands over with the till. Deliberately a
 * plain, self-contained document (store header, every figure, a signature line)
 * so it stands alone once printed and detached from the screen it came from.
 */
export function DailyBriefDocument({
  store,
  closing,
  cashFlow,
  preparedBy,
}: {
  store: Store | null | undefined;
  closing: DailyClosingSummary;
  cashFlow: CashFlowSummary;
  preparedBy: string;
}) {
  const { t } = useLocale();
  const cur = store?.currency;

  const differenceLabel =
    closing.cashDifference === null
      ? t("cashFlow.notCounted")
      : closing.cashDifference === 0
        ? t("cashFlow.balanced")
        : closing.cashDifference > 0
          ? t("cashFlow.surplus")
          : t("cashFlow.shortage");

  return (
    <div className="mx-auto max-w-2xl space-y-5 text-sm">
      <div className="space-y-1 text-center">
        {store?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logoUrl} alt="" className="mx-auto mb-1 size-14 rounded object-cover" />
        )}
        <p className="text-lg font-bold">{store?.name}</p>
        {store?.address && <p className="text-xs text-muted-foreground">{store.address}</p>}
        <p className="pt-1 text-base font-semibold">{t("endDay.documentTitle")}</p>
        <p className="text-xs text-muted-foreground">{closing.date}</p>
      </div>

      <Section title={t("endDay.sectionSales")}>
        <Row label={t("dailyClosing.cashSales")} value={formatMoney(closing.cashSales, cur)} indent />
        <Row label={t("dailyClosing.cardSales")} value={formatMoney(closing.cardSales, cur)} indent />
        <Row label={t("dailyClosing.otherSales")} value={formatMoney(closing.otherPaymentSales, cur)} indent />
        <Row label={t("dailyClosing.totalSales")} value={formatMoney(closing.totalSales, cur)} emphasis />
        <Row label={t("dailyClosing.transactionCount")} value={formatNumber(closing.transactionCount)} />
      </Section>

      <Section title={t("endDay.sectionExpenses")}>
        {closing.expenseLines.length === 0 ? (
          <p className="py-1 text-muted-foreground">{t("expenses.noExpenses")}</p>
        ) : (
          closing.expenseLines.map((e) => (
            <Row
              key={e.id}
              label={`${e.description} (${e.categoryName}, ${t(PAYMENT_METHOD_KEY[e.paymentMethod])}) — ${e.createdByName}`}
              value={formatMoney(e.amount, cur)}
              indent
            />
          ))
        )}
        <Row label={t("dailyClosing.cashExpenses")} value={formatMoney(closing.cashExpenses, cur)} />
        <Row label={t("dailyClosing.totalExpenses")} value={formatMoney(closing.totalExpenses, cur)} emphasis />
      </Section>

      <Section title={t("endDay.sectionCash")}>
        <Row label={t("cashFlow.openingCash")} value={formatMoney(cashFlow.openingCash, cur)} indent />
        <Row label={`+ ${t("cashFlow.cashSales")}`} value={formatMoney(cashFlow.cashSales, cur)} indent />
        <Row label={`− ${t("cashFlow.cashRefunds")}`} value={formatMoney(cashFlow.cashRefunds, cur)} indent />
        <Row label={`− ${t("cashFlow.cashExpenses")}`} value={formatMoney(cashFlow.cashExpenses, cur)} indent />
        <Row
          label={t("cashFlow.expectedClosingCash")}
          value={formatMoney(closing.expectedClosingCash, cur)}
          emphasis
        />
        <Row
          label={t("cashFlow.actualClosingCash")}
          value={closing.actualClosingCash === null ? "—" : formatMoney(closing.actualClosingCash, cur)}
        />
        <Row
          label={`${t("cashFlow.difference")} (${differenceLabel})`}
          value={closing.cashDifference === null ? "—" : formatMoney(Math.abs(closing.cashDifference), cur)}
          emphasis
        />
      </Section>

      <Section title={t("endDay.sectionResult")}>
        <Row label={t("dailyClosing.totalSales")} value={formatMoney(closing.totalSales, cur)} indent />
        <Row label={`− ${t("dailyClosing.totalExpenses")}`} value={formatMoney(closing.totalExpenses, cur)} indent />
        <Row label={t("dailyClosing.netIncome")} value={formatMoney(closing.netIncome, cur)} emphasis />
      </Section>

      {closing.pendingExpenses.count > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("dailyClosing.pendingNote", {
            count: closing.pendingExpenses.count,
            amount: formatMoney(closing.pendingExpenses.amount, cur),
          })}
        </p>
      )}

      <div className="print-keep-together space-y-4 border-t pt-3 text-xs text-muted-foreground">
        <p>
          {t("endDay.preparedBy", { name: preparedBy })} · {formatDateTime(new Date().toISOString())}
        </p>
        <div className="flex gap-10 pt-6">
          <div className="flex-1 border-t pt-1">{t("endDay.signatureCashier")}</div>
          <div className="flex-1 border-t pt-1">{t("endDay.signatureManager")}</div>
        </div>
      </div>
    </div>
  );
}
