"use client";

import type { BusinessSession, SessionSummary } from "@/lib/api/sessions";
import { formatDuration } from "@/lib/api/sessions";
import type { Store } from "@/lib/api/types";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${emphasis ? "border-t font-semibold" : ""}`}>
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

/** The printed record of one business session — identified by its session number,
 * not a calendar date, since a session may span midnight or share a date with another. */
export function SessionBriefDocument({
  store,
  session,
  summary,
  durationMs,
}: {
  store: Store | null | undefined;
  session: BusinessSession;
  summary: SessionSummary;
  durationMs: number;
}) {
  const { t } = useLocale();
  const cur = store?.currency;
  const label = `#${String(session.sessionNumber).padStart(3, "0")}`;

  return (
    <div className="mx-auto max-w-2xl space-y-5 text-sm">
      <div className="space-y-1 text-center">
        {store?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logoUrl} alt="" className="mx-auto mb-1 size-14 rounded object-cover" />
        )}
        <p className="text-lg font-bold">{store?.name}</p>
        {store?.address && <p className="text-xs text-muted-foreground">{store.address}</p>}
        <p className="pt-1 text-base font-semibold">{t("session.documentTitle", { number: label })}</p>
      </div>

      <Section title={t("session.sectionSession")}>
        <Row label={t("session.colSession")} value={label} />
        <Row label={t("session.startedAt")} value={formatDateTime(session.startedAt)} />
        <Row
          label={t("session.endedAt")}
          value={session.endedAt ? formatDateTime(session.endedAt) : t("session.badgeActive")}
        />
        <Row label={t("session.duration")} value={formatDuration(durationMs)} />
        <Row label={t("session.startedBy")} value={session.startedBy.fullName} />
        {session.endedBy && <Row label={t("session.endedBy")} value={session.endedBy.fullName} />}
      </Section>

      <Section title={t("session.sectionTrading")}>
        <Row
          label={`${t("session.totalSales")} (${formatNumber(summary.salesCount)})`}
          value={formatMoney(summary.totalSales, cur)}
        />
        <Row
          label={`${t("session.totalRefunds")} (${formatNumber(summary.refundsCount)})`}
          value={`-${formatMoney(summary.totalRefunds, cur)}`}
        />
        <Row
          label={`${t("session.totalExchanges")} (${formatNumber(summary.exchangesCount)})`}
          value={formatMoney(summary.totalExchanges, cur)}
        />
        <Row label={t("session.netSales")} value={formatMoney(summary.netSales, cur)} emphasis />
        <Row label={t("session.unitsSold")} value={formatNumber(summary.unitsSold)} />
      </Section>

      <Section title={t("session.sectionExpenses")}>
        <Row
          label={`${t("session.totalExpenses")} (${formatNumber(summary.expensesCount)})`}
          value={formatMoney(summary.totalExpenses, cur)}
        />
      </Section>

      <Section title={t("session.sectionCash")}>
        <Row
          label={t("session.openingCashLabel")}
          value={session.openingCash === null ? "—" : formatMoney(session.openingCash, cur)}
        />
        <Row label={t("session.cashSales")} value={formatMoney(summary.cashSales, cur)} />
        <Row label={t("session.cardSales")} value={formatMoney(summary.cardSales, cur)} />
        <Row label={t("session.otherSales")} value={formatMoney(summary.otherSales, cur)} />
        <Row label={t("session.cashRefunds")} value={`-${formatMoney(summary.cashRefunds, cur)}`} />
        <Row label={t("session.cashExpenses")} value={`-${formatMoney(summary.cashExpenses, cur)}`} />
        <Row label={t("session.netCash")} value={formatMoney(summary.netCash, cur)} emphasis />
        <Row
          label={t("session.closingCashLabel")}
          value={session.closingCash === null ? "—" : formatMoney(session.closingCash, cur)}
        />
      </Section>

      {summary.cashierActivity.length > 0 && (
        <Section title={t("session.cashierActivity")}>
          {summary.cashierActivity.map((a) => (
            <Row
              key={a.userId}
              label={`${a.fullName} (${formatNumber(a.salesCount)})`}
              value={formatMoney(a.salesTotal, cur)}
            />
          ))}
        </Section>
      )}

      <Row label={t("session.transactions")} value={formatNumber(summary.transactionCount)} emphasis />

      <div className="print-keep-together space-y-4 border-t pt-3 text-xs text-muted-foreground">
        <p>{formatDateTime(new Date().toISOString())}</p>
        <div className="flex gap-10 pt-6">
          <div className="flex-1 border-t pt-1">{t("endDay.signatureCashier")}</div>
          <div className="flex-1 border-t pt-1">{t("endDay.signatureManager")}</div>
        </div>
      </div>
    </div>
  );
}
