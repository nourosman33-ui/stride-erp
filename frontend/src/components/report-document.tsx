"use client";

import type { Store } from "@/lib/api/types";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDateTime } from "@/lib/format";

export interface ReportColumn {
  key: string;
  label: string;
  align?: "start" | "end";
}

export type ReportRow = Record<string, string | number | null | undefined>;

/**
 * A printable list of transactions — sales, returns, expenses. One component
 * rather than three near-identical ones, since the only real differences are the
 * column set and the totals line. Rendered inside PrintOnly, so it never competes
 * with the interactive table on screen.
 */
export function ReportDocument({
  store,
  title,
  subtitle,
  columns,
  rows,
  totals,
  emptyLabel,
}: {
  store: Store | null | undefined;
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Rendered under the table, e.g. "Total  EGP 1,234.00". */
  totals?: { label: string; value: string }[];
  emptyLabel: string;
}) {
  const { t } = useLocale();

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-0.5 border-b pb-2">
        <div className="flex items-baseline justify-between">
          <p className="text-lg font-bold">{store?.name}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(new Date().toISOString())}</p>
        </div>
        <p className="text-base font-semibold">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        <p className="text-xs text-muted-foreground">{t("reportDoc.rowCount", { count: rows.length })}</p>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">{emptyLabel}</p>
      ) : (
        <table>
          <thead>
            <tr className="border-b">
              {columns.map((c) => (
                <th key={c.key} className={c.align === "end" ? "text-end" : "text-start"}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={c.align === "end" ? "text-end tabular-nums" : "text-start"}
                  >
                    {row[c.key] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totals && totals.length > 0 && (
        <div className="print-keep-together ms-auto w-64 space-y-1 border-t pt-2">
          {totals.map((tot) => (
            <div key={tot.label} className="flex justify-between font-semibold">
              <span>{tot.label}</span>
              <span className="tabular-nums">{tot.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
