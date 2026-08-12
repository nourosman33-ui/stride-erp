"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDot, History, ListOrdered, Loader2, PlayCircle, Printer, StopCircle } from "lucide-react";
import { toast } from "sonner";

import {
  endSession,
  formatDuration,
  getSession,
  listSessions,
  startSession,
  type BusinessSession,
  type SessionSummary,
} from "@/lib/api/sessions";
import { getActiveSession } from "@/lib/api/sessions";
import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { SessionBriefDocument } from "@/components/sessions/session-brief-document";
import { PrintOnly } from "@/components/print-document";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function sessionLabel(n: number): string {
  return `#${String(n).padStart(3, "0")}`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function SummaryGrid({ summary, currency }: { summary: SessionSummary; currency?: string }) {
  const { t } = useLocale();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label={t("session.totalSales")}
        value={formatMoney(summary.totalSales, currency)}
        sub={t("session.countLabel", { count: summary.salesCount })}
      />
      <Stat
        label={t("session.totalRefunds")}
        value={formatMoney(summary.totalRefunds, currency)}
        sub={t("session.countLabel", { count: summary.refundsCount })}
      />
      <Stat
        label={t("session.totalExchanges")}
        value={formatMoney(summary.totalExchanges, currency)}
        sub={t("session.countLabel", { count: summary.exchangesCount })}
      />
      <Stat
        label={t("session.totalExpenses")}
        value={formatMoney(summary.totalExpenses, currency)}
        sub={t("session.countLabel", { count: summary.expensesCount })}
      />
      <Stat label={t("session.netSales")} value={formatMoney(summary.netSales, currency)} />
      <Stat label={t("session.netCash")} value={formatMoney(summary.netCash, currency)} />
      <Stat label={t("session.transactions")} value={formatNumber(summary.transactionCount)} />
      <Stat label={t("session.unitsSold")} value={formatNumber(summary.unitsSold)} />
    </div>
  );
}

export default function SessionPage() {
  const { t } = useLocale();
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const queryClient = useQueryClient();

  const [openingCash, setOpeningCash] = React.useState("");
  const [closingCash, setClosingCash] = React.useState("");
  const [confirmEndOpen, setConfirmEndOpen] = React.useState(false);
  const [viewingSessionId, setViewingSessionId] = React.useState<string | null>(null);
  // Which session the printer should get. Null means "whatever is active",
  // so a plain Ctrl+P still produces the current session's summary.
  const [printSessionId, setPrintSessionId] = React.useState<string | null>(null);
  // Ticks once a minute so the on-screen duration stays honest without re-fetching.
  const [, forceTick] = React.useState(0);

  const { data: active, isLoading } = useQuery({
    queryKey: ["session", "active", activeStoreId],
    queryFn: () => getActiveSession(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const { data: history } = useQuery({
    queryKey: ["session", "history", activeStoreId],
    queryFn: () => listSessions(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const { data: viewing } = useQuery({
    queryKey: ["session", "detail", viewingSessionId],
    queryFn: () => getSession(viewingSessionId!),
    enabled: !!viewingSessionId,
  });

  // Same query key as the detail dialog, so opening then printing a session
  // reuses the cached fetch rather than going back to the server.
  const { data: printTarget } = useQuery({
    queryKey: ["session", "detail", printSessionId],
    queryFn: () => getSession(printSessionId!),
    enabled: !!printSessionId,
  });

  React.useEffect(() => {
    if (!printSessionId) return;
    // Wait for the right session's data — otherwise a cached previous target
    // would be what actually reaches the printer.
    if (printTarget?.session?.id !== printSessionId) return;
    // Yield once so the print portal is laid out before the dialog opens. A timeout
    // rather than requestAnimationFrame: browsers suspend rAF in a backgrounded tab,
    // which would leave the print silently never firing.
    const timer = setTimeout(() => {
      window.print();
      setPrintSessionId(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [printSessionId, printTarget]);

  React.useEffect(() => {
    if (!active?.session) return;
    const id = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [active?.session]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["session"] });
    queryClient.invalidateQueries({ queryKey: ["transaction-log"] });
  }

  const startMutation = useMutation({
    mutationFn: () => startSession(activeStoreId!, openingCash === "" ? undefined : Number(openingCash)),
    onSuccess: (s) => {
      refresh();
      setOpeningCash("");
      toast.success(t("session.startedToast", { number: sessionLabel(s.sessionNumber) }));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("session.actionFailed")),
  });

  const endMutation = useMutation({
    mutationFn: () =>
      endSession(active!.session!.id, closingCash === "" ? undefined : Number(closingCash)),
    onSuccess: (s) => {
      refresh();
      setClosingCash("");
      setConfirmEndOpen(false);
      // Drop straight into the closed session's final summary.
      setViewingSessionId(s.id);
      toast.success(t("session.endedToast", { number: sessionLabel(s.sessionNumber) }));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("session.actionFailed")),
  });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("session.title")} description={t("session.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  const cur = activeStore?.currency;
  const session = active?.session ?? null;
  const isActive = !!session;
  const summary = active?.summary;
  const liveDuration = session ? Date.now() - new Date(session.startedAt).getTime() : 0;

  // What the printer would get right now: the explicitly chosen session if its
  // data has arrived, otherwise the live one so Ctrl+P still does the obvious thing.
  // `/sessions/active` and `/sessions/:id` share a response type whose session is
  // nullable, hence the explicit rebuild rather than passing the response through.
  const chosen =
    printSessionId && printTarget?.session?.id === printSessionId ? printTarget : null;
  const printDoc = chosen?.session
    ? { session: chosen.session, summary: chosen.summary, durationMs: chosen.durationMs }
    : session && summary
      ? { session, summary, durationMs: liveDuration }
      : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("session.title")}
        description={activeStore?.name}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/pos/transactions">
                <ListOrdered className="size-4" />
                {t("session.viewLog")}
              </Link>
            </Button>
            {isActive && active?.session && (
              <Button variant="outline" size="sm" onClick={() => setPrintSessionId(active.session!.id)}>
                <Printer className="size-4" />
                {t("session.printSummary")}
              </Button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Card className={isActive ? "border-2 border-success/50" : "border-2 border-dashed"}>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <CircleDot className={`size-4 ${isActive ? "text-success" : "text-muted-foreground"}`} />
                {isActive
                  ? t("session.statusActive", { number: sessionLabel(session.sessionNumber) })
                  : t("session.statusNone")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {isActive ? t("session.activeHint") : t("session.noneHint")}
              </p>
            </div>
            <Badge variant={isActive ? "success" : "outline"}>
              {isActive ? t("session.badgeActive") : t("session.badgeNone")}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {isActive ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("session.startedAt")}</p>
                    <p className="text-sm font-medium">{formatDateTime(session.startedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("session.duration")}</p>
                    <p className="text-sm font-medium tabular-nums">{formatDuration(liveDuration)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("session.startedBy")}</p>
                    <p className="text-sm font-medium">{session.startedBy.fullName}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                  <div className="grow">
                    <p className="pb-1 text-xs text-muted-foreground">{t("session.closingCashLabel")}</p>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={t("session.closingCashPlaceholder")}
                      value={closingCash}
                      onChange={(e) => setClosingCash(e.target.value)}
                      className="h-9 max-w-xs"
                    />
                  </div>
                  <Button variant="destructive" onClick={() => setConfirmEndOpen(true)}>
                    <StopCircle className="size-4" />
                    {t("session.endDay")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div className="grow">
                  <p className="pb-1 text-xs text-muted-foreground">{t("session.openingCashLabel")}</p>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={t("session.openingCashPlaceholder")}
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    className="h-9 max-w-xs"
                  />
                </div>
                <Button disabled={startMutation.isPending} onClick={() => startMutation.mutate()}>
                  {startMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PlayCircle className="size-4" />
                  )}
                  {t("session.startDay")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isActive && summary && (
        <>
          <h2 className="pt-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("session.currentSummary")}
          </h2>
          <SummaryGrid summary={summary} currency={cur} />

          {summary.cashierActivity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("session.cashierActivity")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {summary.cashierActivity.map((a) => (
                  <div key={a.userId} className="flex justify-between border-b py-1.5 text-sm last:border-0">
                    <span>{a.fullName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {t("session.countLabel", { count: a.salesCount })} ·{" "}
                      {formatMoney(a.salesTotal, cur)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            {t("session.history")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("session.colSession")}</TableHead>
                <TableHead>{t("session.colStart")}</TableHead>
                <TableHead>{t("session.colEnd")}</TableHead>
                <TableHead>{t("session.colDuration")}</TableHead>
                <TableHead>{t("session.colUser")}</TableHead>
                <TableHead>{t("session.colStatus")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!history || history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {t("session.noSessions")}
                  </TableCell>
                </TableRow>
              ) : (
                history.map((s: BusinessSession) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{sessionLabel(s.sessionNumber)}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(s.startedAt)}</TableCell>
                    <TableCell className="text-xs">
                      {s.endedAt ? formatDateTime(s.endedAt) : "—"}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {formatDuration(
                        (s.endedAt ? new Date(s.endedAt).getTime() : Date.now()) -
                          new Date(s.startedAt).getTime(),
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{s.startedBy.fullName}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "active" ? "success" : "outline"}>
                        {t(s.status === "active" ? "session.badgeActive" : "session.badgeClosed")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setViewingSessionId(s.id)}
                        >
                          {t("session.viewDetails")}
                        </Button>
                        {/* Any session can be reprinted, not just the live one —
                            reprints of a closed shift are the common case. */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          title={t("session.printSummary")}
                          disabled={printSessionId === s.id}
                          onClick={() => setPrintSessionId(s.id)}
                        >
                          {printSessionId === s.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Printer className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reviewing a past session never touches the active one — it's a read of a
          frozen record, keyed by its own session id. */}
      <Dialog open={!!viewingSessionId} onOpenChange={(o) => !o && setViewingSessionId(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {viewing?.session
                ? t("session.detailTitle", { number: sessionLabel(viewing.session.sessionNumber) })
                : t("session.title")}
            </DialogTitle>
            {viewing?.session && (
              <DialogDescription>
                {formatDateTime(viewing.session.startedAt)} →{" "}
                {viewing.session.endedAt ? formatDateTime(viewing.session.endedAt) : t("session.badgeActive")} ·{" "}
                {formatDuration(viewing.durationMs)}
              </DialogDescription>
            )}
          </DialogHeader>
          {!viewing ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-3">
              <SummaryGrid summary={viewing.summary} currency={cur} />
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/pos/transactions?sessionId=${viewing.session?.id ?? ""}`}>
                    <ListOrdered className="size-4" />
                    {t("session.viewSessionLog")}
                  </Link>
                </Button>
                {viewing.session && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!printSessionId}
                    onClick={() => setPrintSessionId(viewing.session!.id)}
                  >
                    {printSessionId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Printer className="size-4" />
                    )}
                    {t("session.printSummary")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmEndOpen} onOpenChange={setConfirmEndOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("session.confirmEndTitle")}</DialogTitle>
            <DialogDescription>{t("session.confirmEndBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEndOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={endMutation.isPending}
              onClick={() => endMutation.mutate()}
            >
              {endMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("session.endDay")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exactly one printable document may exist at a time, or the printer would
          get several. A chosen session wins; otherwise the live one is what a bare
          Ctrl+P produces. `variant="receipt"` prints it as an 80mm till slip, the
          same format as a sales receipt. */}
      {printDoc && (
        <PrintOnly variant="receipt">
          <SessionBriefDocument
            store={activeStore}
            session={printDoc.session}
            summary={printDoc.summary}
            durationMs={printDoc.durationMs}
          />
        </PrintOnly>
      )}
    </div>
  );
}
