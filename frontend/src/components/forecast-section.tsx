"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Copy, Info, Link2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createFeedToken,
  feedUrl,
  getForecast,
  listFeedTokens,
  revokeFeedToken,
} from "@/lib/api/export";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDate, formatMoney } from "@/lib/format";
import { CHART_INK, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_LABEL_STYLE } from "@/lib/chart-colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const HORIZONS = [3, 6, 12] as const;
const FEEDS = ["financials", "forecast", "sales", "stock"] as const;

export function ForecastSection({ storeId }: { storeId: string }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [horizon, setHorizon] = React.useState<number>(6);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");

  const { data: forecast, isLoading } = useQuery({
    queryKey: ["forecast", storeId, horizon],
    queryFn: () => getForecast(storeId, horizon),
  });

  const { data: tokens } = useQuery({
    queryKey: ["feed-tokens", storeId],
    queryFn: () => listFeedTokens(storeId),
  });

  const createMutation = useMutation({
    mutationFn: () => createFeedToken(storeId, label.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-tokens", storeId] });
      toast.success(t("exports.linkCreated"));
      setLinkOpen(false);
      setLabel("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("exports.linkFailed")),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeFeedToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-tokens", storeId] });
      toast.success(t("exports.linkRevoked"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("exports.linkFailed")),
  });

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("exports.copied"));
    } catch {
      toast.error(url);
    }
  }

  const cur = forecast?.currency;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">{t("exports.forecastTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("exports.forecastSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {HORIZONS.map((h) => (
              <Button
                key={h}
                size="sm"
                variant={horizon === h ? "default" : "outline"}
                onClick={() => setHorizon(h)}
              >
                {t(h === 3 ? "exports.months3" : h === 6 ? "exports.months6" : "exports.months12")}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !forecast ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={forecast.basis.confidence === "medium" ? "secondary" : "warning"}>
                  {t(
                    forecast.basis.confidence === "medium"
                      ? "exports.confidenceMedium"
                      : "exports.confidenceLow",
                  )}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t("exports.basisDays", { days: forecast.basis.daysWithData })}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border p-2.5">
                  <p className="text-xs text-muted-foreground">{t("exports.totalRevenue")}</p>
                  <p className="font-semibold tabular-nums">
                    {formatMoney(forecast.summary.totalProjectedNetRevenue, cur)}
                  </p>
                </div>
                <div className="rounded-md border p-2.5">
                  <p className="text-xs text-muted-foreground">{t("exports.totalProfit")}</p>
                  <p
                    className={`font-semibold tabular-nums ${
                      forecast.summary.totalProjectedNetProfit >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {formatMoney(forecast.summary.totalProjectedNetProfit, cur)}
                  </p>
                </div>
                <div className="rounded-md border p-2.5">
                  <p className="text-xs text-muted-foreground">{t("exports.paybackAt")}</p>
                  <p className="font-semibold">
                    {forecast.summary.paybackMonth ??
                      <span className="text-sm font-normal text-muted-foreground">
                        {t("exports.paybackNever")}
                      </span>}
                  </p>
                </div>
                <div className="rounded-md border p-2.5">
                  <p className="text-xs text-muted-foreground">{t("exports.firstProfitable")}</p>
                  <p className="font-semibold">
                    {forecast.summary.firstProfitableMonth ?? (
                      <span className="text-sm font-normal text-muted-foreground">—</span>
                    )}
                  </p>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={forecast.months} margin={{ left: 4, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="fcFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={CHART_INK.gridline} />
                  <XAxis dataKey="label" stroke={CHART_INK.muted} fontSize={11} />
                  <YAxis stroke={CHART_INK.muted} fontSize={11} width={64} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    formatter={(v) => formatMoney(Number(v ?? 0), cur)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="projectedNetRevenue"
                    name={t("exports.colProjRevenue")}
                    stroke="var(--color-primary)"
                    fill="url(#fcFill)"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedNetProfit"
                    name={t("exports.colProjNet")}
                    stroke="var(--color-success)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("exports.colMonth")}</TableHead>
                      <TableHead className="text-end">{t("exports.colProjRevenue")}</TableHead>
                      <TableHead className="text-end">{t("exports.colProjGross")}</TableHead>
                      <TableHead className="text-end">{t("exports.colProjCosts")}</TableHead>
                      <TableHead className="text-end">{t("exports.colProjNet")}</TableHead>
                      <TableHead className="text-end">{t("exports.colCumulative")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forecast.months.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell className="font-medium">{m.label}</TableCell>
                        <TableCell className="text-end tabular-nums">
                          {formatMoney(m.projectedNetRevenue, cur)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {formatMoney(m.projectedGrossProfit, cur)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {formatMoney(m.projectedOperatingCosts, cur)}
                        </TableCell>
                        <TableCell
                          className={`text-end tabular-nums ${
                            m.projectedNetProfit >= 0 ? "text-success" : "text-destructive"
                          }`}
                        >
                          {formatMoney(m.projectedNetProfit, cur)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {formatMoney(m.cumulativeNetProfit, cur)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  {t("exports.estimateWarning")} {forecast.basis.note}
                </span>
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="size-4" />
              {t("exports.feedsTitle")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t("exports.feedsSubtitle")}</p>
          </div>
          <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                {t("exports.newLink")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("exports.newLink")}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (label.trim()) createMutation.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("exports.linkLabel")}</label>
                  <Input
                    autoFocus
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={t("exports.linkLabelPlaceholder")}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={!label.trim() || createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                    {t("exports.createLink")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            {t("exports.feedsWarning")}
          </p>

          {!tokens || tokens.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("exports.noLinks")}</p>
          ) : (
            <div className="space-y-3">
              {tokens.map((tk) => (
                <div key={tk.id} className={`rounded-md border p-3 ${tk.revokedAt ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {tk.label}
                        {tk.revokedAt && (
                          <Badge variant="destructive" className="ms-2 text-[10px]">
                            {t("exports.revoked")}
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("exports.colCreated")}: {formatDate(tk.createdAt)} ·{" "}
                        {t("exports.colLastUsed")}:{" "}
                        {tk.lastUsedAt ? formatDate(tk.lastUsedAt) : t("exports.neverUsed")}
                      </p>
                    </div>
                    {!tk.revokedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate(tk.id)}
                      >
                        {t("exports.revoke")}
                      </Button>
                    )}
                  </div>
                  {!tk.revokedAt && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {FEEDS.map((f) => (
                        <Button
                          key={f}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => copy(feedUrl(tk.token, f))}
                        >
                          <Copy className="size-3" />
                          {t(`exports.feed${f.charAt(0).toUpperCase()}${f.slice(1)}` as
                            | "exports.feedFinancials"
                            | "exports.feedForecast"
                            | "exports.feedSales"
                            | "exports.feedStock")}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <Separator />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Info className="size-3.5" />
              {t("exports.howToTitle")}
            </p>
            <p>1. {t("exports.howToStep1")}</p>
            <p>2. {t("exports.howToStep2")}</p>
            <p>3. {t("exports.howToStep3")}</p>
            <p>4. {t("exports.howToStep4")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
