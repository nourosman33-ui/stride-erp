"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";

import {
  getTransactionLogTotals,
  listSessions,
  listTransactionLog,
  type TransactionLogEntry,
  type TransactionType,
} from "@/lib/api/sessions";
import { useActiveStore } from "@/lib/store-context";
import { useLocale, type TranslationKey } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { PAYMENT_METHOD_KEY } from "@/lib/payment-methods";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { PrintOnly } from "@/components/print-document";
import { ReportDocument } from "@/components/report-document";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TYPE_KEY: Record<TransactionType, TranslationKey> = {
  sale: "transactionLog.typeSale",
  refund: "transactionLog.typeRefund",
  exchange: "transactionLog.typeExchange",
  expense: "transactionLog.typeExpense",
};

const TYPE_VARIANT: Record<TransactionType, "secondary" | "destructive" | "outline" | "success"> = {
  sale: "success",
  refund: "destructive",
  exchange: "secondary",
  expense: "outline",
};

function sessionLabel(n: number | null): string {
  return n === null ? "—" : `#${String(n).padStart(3, "0")}`;
}

function TransactionLogInner() {
  const { t } = useLocale();
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const searchParams = useSearchParams();
  const sessionFromUrl = searchParams.get("sessionId");

  const [sessionId, setSessionId] = React.useState<string>(sessionFromUrl ?? "all");
  const [type, setType] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");

  const filters = React.useMemo(
    () => ({
      storeId: activeStoreId!,
      sessionId: sessionId === "all" ? undefined : sessionId,
      type: type === "all" ? undefined : (type as TransactionType),
      limit: 500,
    }),
    [activeStoreId, sessionId, type],
  );

  const { data: entries, isLoading } = useQuery({
    queryKey: ["transaction-log", filters],
    queryFn: () => listTransactionLog(filters),
    enabled: !!activeStoreId,
  });

  const { data: totals } = useQuery({
    queryKey: ["transaction-log", "totals", activeStoreId, filters.sessionId],
    queryFn: () => getTransactionLogTotals({ storeId: activeStoreId!, sessionId: filters.sessionId }),
    enabled: !!activeStoreId,
  });

  const { data: sessions } = useQuery({
    queryKey: ["session", "history", activeStoreId],
    queryFn: () => listSessions(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = entries ?? [];
    if (!q) return list;
    return list.filter((e) =>
      [e.reference, e.customerName, e.userName, e.itemSummary, e.relatedReference].some((f) =>
        f?.toLowerCase().includes(q),
      ),
    );
  }, [entries, search]);

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("transactionLog.title")} description={t("transactionLog.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  const cur = activeStore?.currency;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("transactionLog.title")}
        description={t("transactionLog.description")}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/pos/session">
              <ArrowLeft className="size-4" />
              {t("session.title")}
            </Link>
          </Button>
        }
      />

      {totals && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{t("transactionLog.totalEntries")}</p>
              <p className="text-lg font-semibold tabular-nums">{formatNumber(totals.count)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{t("transactionLog.typeSale")}</p>
              <p className="text-lg font-semibold tabular-nums">{formatMoney(totals.sales, cur)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{t("transactionLog.typeRefund")}</p>
              <p className="text-lg font-semibold tabular-nums">{formatMoney(totals.refunds, cur)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{t("transactionLog.typeExpense")}</p>
              <p className="text-lg font-semibold tabular-nums">{formatMoney(totals.expenses, cur)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{t("transactionLog.netAmount")}</p>
              <p className="text-lg font-semibold tabular-nums">{formatMoney(totals.net, cur)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={sessionId} onValueChange={setSessionId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder={t("transactionLog.allSessions")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("transactionLog.allSessions")}</SelectItem>
            {(sessions ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {sessionLabel(s.sessionNumber)} · {formatDateTime(s.startedAt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("transactionLog.allTypes")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("transactionLog.allTypes")}</SelectItem>
            <SelectItem value="sale">{t("transactionLog.typeSale")}</SelectItem>
            <SelectItem value="refund">{t("transactionLog.typeRefund")}</SelectItem>
            <SelectItem value="exchange">{t("transactionLog.typeExchange")}</SelectItem>
            <SelectItem value="expense">{t("transactionLog.typeExpense")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative ms-auto w-full max-w-xs">
          <Search className="absolute top-1/2 start-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("transactionLog.searchPlaceholder")}
            className="h-8 ps-8"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("transactionLog.colTime")}</TableHead>
              <TableHead>{t("transactionLog.colSession")}</TableHead>
              <TableHead>{t("transactionLog.colType")}</TableHead>
              <TableHead>{t("transactionLog.colReference")}</TableHead>
              <TableHead>{t("transactionLog.colCustomer")}</TableHead>
              <TableHead>{t("transactionLog.colUser")}</TableHead>
              <TableHead>{t("transactionLog.colItems")}</TableHead>
              <TableHead>{t("transactionLog.colRelated")}</TableHead>
              <TableHead>{t("transactionLog.colMethod")}</TableHead>
              <TableHead className="text-end">{t("transactionLog.colAmount")}</TableHead>
              <TableHead className="text-end">{t("transactionLog.colNet")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={11}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                  {t("transactionLog.noEntries")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e: TransactionLogEntry) => (
                <TableRow key={`${e.type}-${e.transactionId}`}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(e.occurredAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{sessionLabel(e.sessionNumber)}</TableCell>
                  <TableCell>
                    <Badge variant={TYPE_VARIANT[e.type]}>{t(TYPE_KEY[e.type])}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.reference}</TableCell>
                  <TableCell className="text-xs">{e.customerName ?? "—"}</TableCell>
                  <TableCell className="text-xs">{e.userName}</TableCell>
                  <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                    {e.itemSummary ?? "—"}
                    {e.quantity !== null && ` (${e.quantity})`}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {e.relatedReference ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {e.paymentMethod ? t(PAYMENT_METHOD_KEY[e.paymentMethod]) : "—"}
                  </TableCell>
                  <TableCell className="text-end text-xs tabular-nums">
                    {formatMoney(e.originalAmount, cur)}
                  </TableCell>
                  <TableCell
                    className={`text-end font-medium tabular-nums ${
                      e.netAmount < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {formatMoney(e.netAmount, cur)}
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
          title={t("transactionLog.title")}
          subtitle={sessionId === "all" ? undefined : sessionLabel(
            sessions?.find((s) => s.id === sessionId)?.sessionNumber ?? null,
          )}
          emptyLabel={t("transactionLog.noEntries")}
          columns={[
            { key: "time", label: t("transactionLog.colTime") },
            { key: "session", label: t("transactionLog.colSession") },
            { key: "type", label: t("transactionLog.colType") },
            { key: "reference", label: t("transactionLog.colReference") },
            { key: "customer", label: t("transactionLog.colCustomer") },
            { key: "user", label: t("transactionLog.colUser") },
            { key: "net", label: t("transactionLog.colNet"), align: "end" },
          ]}
          rows={filtered.map((e) => ({
            time: formatDateTime(e.occurredAt),
            session: sessionLabel(e.sessionNumber),
            type: t(TYPE_KEY[e.type]),
            reference: e.reference,
            customer: e.customerName ?? "—",
            user: e.userName,
            net: formatMoney(e.netAmount, cur),
          }))}
          totals={
            totals
              ? [{ label: t("transactionLog.netAmount"), value: formatMoney(totals.net, cur) }]
              : undefined
          }
        />
      </PrintOnly>
    </div>
  );
}

export default function TransactionLogPage() {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <React.Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TransactionLogInner />
    </React.Suspense>
  );
}
