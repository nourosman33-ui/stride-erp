"use client";

import type { BusinessSession, SessionSummary } from "@/lib/api/sessions";
import { formatDuration } from "@/lib/api/sessions";
import type { Store } from "@/lib/api/types";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

/** Label/value line in the muted receipt idiom — value carries the ink. */
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="text-end text-foreground">{value}</span>
    </div>
  );
}

/** A money line in the body of the receipt. */
function Line({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-2 ${emphasis ? "text-base font-semibold" : ""}`}>
      <span className={emphasis ? "" : "text-muted-foreground"}>
        {label}
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

/**
 * The printed record of one business session, deliberately built in the same
 * visual language as ReceiptView (centred store header, bordered meta block,
 * bordered money sections, store footer) so it comes off the same roll looking
 * like the rest of the shop's paperwork rather than a spreadsheet.
 *
 * Identified by session number, not a date — a session may span midnight or
 * share a calendar date with another.
 */
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
        <p className="pt-1 font-semibold">{t("session.documentTitle", { number: label })}</p>
      </div>

      <div className="space-y-0.5 border-y py-2 text-xs text-muted-foreground">
        <Meta label={t("session.colSession")} value={label} />
        <Meta label={t("session.startedAt")} value={formatDateTime(session.startedAt)} />
        <Meta
          label={t("session.endedAt")}
          value={session.endedAt ? formatDateTime(session.endedAt) : t("session.badgeActive")}
        />
        <Meta label={t("session.duration")} value={formatDuration(durationMs)} />
        <Meta label={t("session.startedBy")} value={session.startedBy.fullName} />
        {session.endedBy && <Meta label={t("session.endedBy")} value={session.endedBy.fullName} />}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{t("session.sectionTrading")}</p>
        <Line
          label={t("session.totalSales")}
          sub={t("session.countLabel", { count: summary.salesCount })}
          value={formatMoney(summary.totalSales, cur)}
        />
        <Line
          label={t("session.totalRefunds")}
          sub={t("session.countLabel", { count: summary.refundsCount })}
          value={`-${formatMoney(summary.totalRefunds, cur)}`}
        />
        <Line
          label={t("session.totalExchanges")}
          sub={t("session.countLabel", { count: summary.exchangesCount })}
          value={formatMoney(summary.totalExchanges, cur)}
        />
        <div className="border-t pt-1">
          <Line label={t("session.netSales")} value={formatMoney(summary.netSales, cur)} emphasis />
        </div>
        <Line label={t("session.unitsSold")} value={formatNumber(summary.unitsSold)} />
      </div>

      <div className="space-y-1 border-t pt-2">
        <p className="text-xs font-medium text-muted-foreground">{t("session.sectionExpenses")}</p>
        <Line
          label={t("session.totalExpenses")}
          sub={t("session.countLabel", { count: summary.expensesCount })}
          value={`-${formatMoney(summary.totalExpenses, cur)}`}
        />
      </div>

      <div className="space-y-1 border-t pt-2">
        <p className="text-xs font-medium text-muted-foreground">{t("session.sectionCash")}</p>
        <Line
          label={t("session.openingCashLabel")}
          value={session.openingCash === null ? "—" : formatMoney(session.openingCash, cur)}
        />
        <Line label={t("session.cashSales")} value={formatMoney(summary.cashSales, cur)} />
        <Line label={t("session.cardSales")} value={formatMoney(summary.cardSales, cur)} />
        <Line label={t("session.otherSales")} value={formatMoney(summary.otherSales, cur)} />
        <Line label={t("session.cashRefunds")} value={`-${formatMoney(summary.cashRefunds, cur)}`} />
        <Line label={t("session.cashExpenses")} value={`-${formatMoney(summary.cashExpenses, cur)}`} />
        <div className="border-t pt-1">
          <Line label={t("session.netCash")} value={formatMoney(summary.netCash, cur)} emphasis />
        </div>
        <Line
          label={t("session.closingCashLabel")}
          value={session.closingCash === null ? "—" : formatMoney(session.closingCash, cur)}
        />
      </div>

      {summary.cashierActivity.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <p className="text-xs font-medium text-muted-foreground">{t("session.cashierActivity")}</p>
          {summary.cashierActivity.map((a) => (
            <Line
              key={a.userId}
              label={a.fullName}
              sub={t("session.countLabel", { count: a.salesCount })}
              value={formatMoney(a.salesTotal, cur)}
            />
          ))}
        </div>
      )}

      <div className="border-t pt-2">
        <Line label={t("session.transactions")} value={formatNumber(summary.transactionCount)} emphasis />
      </div>

      <div className="space-y-3 border-t pt-2 text-xs text-muted-foreground">
        <div className="flex gap-6 pt-4">
          <div className="flex-1 border-t pt-1 text-center">{t("endDay.signatureCashier")}</div>
          <div className="flex-1 border-t pt-1 text-center">{t("endDay.signatureManager")}</div>
        </div>
        <div className="space-y-0.5 text-center">
          <p>{store?.receiptFooterLine1 || t("receipt.defaultFooter1")}</p>
          <p>{formatDateTime(new Date().toISOString())}</p>
        </div>
      </div>
    </div>
  );
}
