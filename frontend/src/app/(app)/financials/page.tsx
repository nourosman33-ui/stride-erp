"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import {
  Banknote,
  Loader2,
  Plus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import {
  closeExpense,
  createExpense,
  getFinanceOverview,
  type ExpenseCategory,
  type ExpenseFrequency,
  type PeriodKey,
} from "@/lib/api/finance";
import { useAuth } from "@/lib/auth-context";
import { useActiveStore } from "@/lib/store-context";
import { useLocale, type TranslationKey } from "@/lib/i18n/locale-context";
import { formatMoney, formatNumber } from "@/lib/format";
import { CHART_INK } from "@/lib/chart-colors";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const PERIODS: { key: PeriodKey; labelKey: TranslationKey }[] = [
  { key: "daily", labelKey: "financials.periodToday" },
  { key: "weekly", labelKey: "financials.periodWeek" },
  { key: "monthly", labelKey: "financials.periodMonth" },
  { key: "last30Days", labelKey: "financials.period30" },
  { key: "inceptionToDate", labelKey: "financials.periodInception" },
];

const CATEGORY_KEY: Record<ExpenseCategory, TranslationKey> = {
  rent: "financials.catRent",
  utilities: "financials.catUtilities",
  salaries: "financials.catSalaries",
  marketing: "financials.catMarketing",
  logistics: "financials.catLogistics",
  maintenance: "financials.catMaintenance",
  software: "financials.catSoftware",
  other: "financials.catOther",
};

const FREQUENCY_KEY: Record<ExpenseFrequency, TranslationKey> = {
  one_time: "financials.freqOneTime",
  daily: "financials.freqDaily",
  weekly: "financials.freqWeekly",
  monthly: "financials.freqMonthly",
  quarterly: "financials.freqQuarterly",
  yearly: "financials.freqYearly",
};

/** Mirrors FinanceService's normalisation so the table's "per month" column agrees with the KPIs. */
const DAYS_PER_MONTH = 365.25 / 12;
const FREQ_DIVISOR: Record<Exclude<ExpenseFrequency, "one_time">, number> = {
  daily: 1,
  weekly: 7,
  monthly: DAYS_PER_MONTH,
  quarterly: 365.25 / 4,
  yearly: 365.25,
};

function fmtPct(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
}

function KpiTile({
  label,
  value,
  sub,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "negative";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="space-y-1 pt-1">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          {Icon && <Icon className="size-4 text-muted-foreground" />}
        </div>
        <p
          className={`text-2xl font-semibold tabular-nums ${
            tone === "positive" ? "text-success" : tone === "negative" ? "text-destructive" : ""
          }`}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/** One row of the P&L bridge. `emphasis` marks the subtotal lines. */
function PnlRow({
  label,
  value,
  currency,
  negative,
  emphasis,
  muted,
}: {
  label: string;
  value: number;
  currency: string;
  negative?: boolean;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-1.5 ${
        emphasis ? "border-t font-semibold" : ""
      } ${muted ? "text-muted-foreground" : ""}`}
    >
      <span className={emphasis ? "" : "text-sm"}>{label}</span>
      <span className={`tabular-nums ${emphasis ? "" : "text-sm"}`}>
        {negative ? "−" : ""}
        {formatMoney(Math.abs(value), currency)}
      </span>
    </div>
  );
}

const expenseSchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1, "Required"),
  amount: z.coerce.number().min(0),
  frequency: z.string().min(1),
  startDate: z.string().min(1, "Required"),
  notes: z.string().optional(),
});
type ExpenseValues = z.infer<typeof expenseSchema>;

function AddExpenseDialog({ storeId }: { storeId: string }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const form = useForm<ExpenseValues>({
    resolver: zodResolver(expenseSchema) as Resolver<ExpenseValues>,
    defaultValues: {
      category: "other",
      label: "",
      amount: 0,
      frequency: "monthly",
      startDate: new Date().toISOString().slice(0, 10),
      notes: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (v: ExpenseValues) =>
      createExpense({
        storeId,
        category: v.category as ExpenseCategory,
        label: v.label,
        amount: v.amount,
        frequency: v.frequency as ExpenseFrequency,
        startDate: new Date(v.startDate).toISOString(),
        notes: v.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
      toast.success(t("financials.expenseCreated"));
      setOpen(false);
      form.reset();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("financials.expenseFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          {t("financials.addExpense")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("financials.newExpenseTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("financials.expenseLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("financials.expenseLabelPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("financials.expenseCategory")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Object.keys(CATEGORY_KEY) as ExpenseCategory[]).map((c) => (
                          <SelectItem key={c} value={c}>
                            {t(CATEGORY_KEY[c])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("financials.expenseFrequency")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Object.keys(FREQUENCY_KEY) as ExpenseFrequency[]).map((f) => (
                          <SelectItem key={f} value={f}>
                            {t(FREQUENCY_KEY[f])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("financials.expenseAmount")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("financials.expenseStartDate")}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("financials.expenseNotes")}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("financials.createExpense")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function FinancialsPage() {
  const { hasRole } = useAuth();
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [period, setPeriod] = React.useState<PeriodKey>("monthly");

  const { data, isLoading } = useQuery({
    queryKey: ["finance-overview", activeStoreId],
    queryFn: () => getFinanceOverview(activeStoreId!),
    enabled: !!activeStoreId && hasRole("owner"),
  });

  const closeMutation = useMutation({
    mutationFn: closeExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
      toast.success(t("financials.expenseClosed"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("financials.expenseFailed")),
  });

  if (!hasRole("owner")) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("financials.title")} description={t("financials.description")} />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <ShieldAlert className="size-10 text-muted-foreground" />
            <p className="font-medium">{t("financials.ownerOnly")}</p>
            <p className="text-sm text-muted-foreground">{t("financials.ownerOnlyDesc")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("financials.title")} description={t("financials.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const cur = data.currency;
  const p = data.periods[period];
  const { planning, costBase, workingCapital } = data;

  const breakEvenGap =
    planning.breakEvenMonthlyRevenue && planning.breakEvenMonthlyRevenue > 0
      ? ((data.periods.last30Days.netRevenue - planning.breakEvenMonthlyRevenue) /
          planning.breakEvenMonthlyRevenue) *
        100
      : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("financials.title")}
        description={activeStore?.name}
        actions={activeStoreId ? <AddExpenseDialog storeId={activeStoreId} /> : undefined}
      />

      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map((opt) => (
          <Button
            key={opt.key}
            size="sm"
            variant={period === opt.key ? "default" : "outline"}
            onClick={() => setPeriod(opt.key)}
          >
            {t(opt.labelKey)}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label={t("financials.netRevenue")}
          value={formatMoney(p.netRevenue, cur)}
          sub={t("financials.netRevenueHint")}
          icon={Banknote}
        />
        <KpiTile
          label={t("financials.grossProfit")}
          value={formatMoney(p.grossProfit, cur)}
          sub={t("financials.grossMargin", { pct: fmtPct(p.grossMarginPct).replace("%", "") })}
          tone={p.grossProfit >= 0 ? "positive" : "negative"}
          icon={TrendingUp}
        />
        <KpiTile
          label={t("financials.operatingCosts")}
          value={formatMoney(p.operatingExpenses, cur)}
          sub={`${formatMoney(costBase.monthlyFixedCosts, cur)} / ${t("financials.periodMonth").toLowerCase()}`}
          icon={Wallet}
        />
        <KpiTile
          label={t("financials.netProfit")}
          value={formatMoney(p.netProfit, cur)}
          sub={t("financials.netMargin", { pct: fmtPct(p.netMarginPct).replace("%", "") })}
          tone={p.netProfit >= 0 ? "positive" : "negative"}
          icon={p.netProfit >= 0 ? TrendingUp : TrendingDown}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("financials.pnlTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("financials.pnlSubtitle", { days: Math.round(p.days) })}
            </p>
          </CardHeader>
          <CardContent className="space-y-0.5">
            <PnlRow label={t("financials.lineGrossRevenue")} value={p.grossRevenue} currency={cur} muted />
            <PnlRow label={t("financials.lineVat")} value={p.vatCollected} currency={cur} negative muted />
            <PnlRow label={t("financials.lineDiscounts")} value={p.discountsGiven} currency={cur} muted />
            <PnlRow label={t("financials.lineNetRevenue")} value={p.netRevenue} currency={cur} emphasis />
            <PnlRow label={t("financials.lineCogs")} value={p.cogs} currency={cur} negative muted />
            <PnlRow label={t("financials.lineGrossProfit")} value={p.grossProfit} currency={cur} emphasis />
            <PnlRow
              label={t("financials.lineOpex")}
              value={p.operatingExpenses}
              currency={cur}
              negative
              muted
            />
            <PnlRow label={t("financials.lineNetProfit")} value={p.netProfit} currency={cur} emphasis />
            <p className="pt-2 text-xs text-muted-foreground">{t("financials.vatNote")}</p>

            <Separator className="my-3" />
            <p className="pb-1 text-sm font-medium">{t("financials.unitEconomics")}</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.orders")}</span>
                <span className="tabular-nums">{formatNumber(p.orderCount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.unitsSold")}</span>
                <span className="tabular-nums">{formatNumber(p.unitsSold)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.averageBasket")}</span>
                <span className="tabular-nums">
                  {p.averageBasket === null ? "—" : formatMoney(p.averageBasket, cur)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.profitPerOrder")}</span>
                <span className="tabular-nums">
                  {p.grossProfitPerOrder === null ? "—" : formatMoney(p.grossProfitPerOrder, cur)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("financials.breakEvenTitle")}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("financials.breakEvenSubtitle", {
                  pct: fmtPct(planning.marginBasisPct).replace("%", ""),
                })}
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.monthlyFixedCosts")}</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(costBase.monthlyFixedCosts, cur)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <span>
                  {t("financials.dailyFixedCosts")}: {formatMoney(costBase.dailyFixedCosts, cur)}
                </span>
                <span>
                  {t("financials.weeklyFixedCosts")}: {formatMoney(costBase.weeklyFixedCosts, cur)}
                </span>
                <span>
                  {t("financials.annualFixedCosts")}: {formatMoney(costBase.annualFixedCosts, cur)}
                </span>
              </div>
              <Separator />
              {planning.breakEvenMonthlyRevenue === null ? (
                <p className="text-muted-foreground">{t("financials.breakEvenNoMargin")}</p>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("financials.breakEvenMonthly")}</span>
                    <span className="font-semibold tabular-nums">
                      {formatMoney(planning.breakEvenMonthlyRevenue, cur)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("financials.breakEvenDaily")}</span>
                    <span className="tabular-nums">
                      {formatMoney(planning.breakEvenDailyRevenue ?? 0, cur)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("financials.breakEvenOrders")}</span>
                    <span className="tabular-nums">
                      {planning.breakEvenOrdersPerMonth === null
                        ? "—"
                        : formatNumber(planning.breakEvenOrdersPerMonth)}
                    </span>
                  </div>
                  {breakEvenGap !== null && (
                    <Badge variant={breakEvenGap >= 0 ? "success" : "warning"}>
                      {breakEvenGap >= 0
                        ? t("financials.aboveBreakEven", { pct: Math.abs(breakEvenGap).toFixed(0) })
                        : t("financials.belowBreakEven", { pct: Math.abs(breakEvenGap).toFixed(0) })}
                    </Badge>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("financials.capitalTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.initialInvestment")}</span>
                <span className="tabular-nums">{formatMoney(planning.initialInvestment, cur)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.cumulativeNetProfit")}</span>
                <span
                  className={`tabular-nums ${planning.cumulativeNetProfit >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {formatMoney(planning.cumulativeNetProfit, cur)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.capitalPosition")}</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(planning.capitalPosition, cur)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.roi")}</span>
                <span className="tabular-nums">{fmtPct(planning.roiPct)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.monthlyRunRate")}</span>
                <span
                  className={`tabular-nums ${planning.monthlyNetProfitRunRate >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {formatMoney(planning.monthlyNetProfitRunRate, cur)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.payback")}</span>
                <span className="tabular-nums">
                  {planning.paybackMonths === null
                    ? t("financials.paybackNa")
                    : t("financials.paybackMonths", { months: planning.paybackMonths.toFixed(1) })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.runway")}</span>
                <span className="tabular-nums">
                  {planning.cashRunwayMonths === null
                    ? t("financials.runwayNa")
                    : t("financials.runwayMonths", { months: planning.cashRunwayMonths.toFixed(1) })}
                </span>
              </div>
              <Separator />
              <p className="pb-1 text-sm font-medium">{t("financials.workingCapitalTitle")}</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.inventoryValue")}</span>
                <span className="tabular-nums">
                  {formatMoney(workingCapital.inventoryValueAtCost, cur)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.inventoryTurnover")}</span>
                <span className="tabular-nums">
                  {workingCapital.inventoryTurnover === null
                    ? "—"
                    : t("financials.turnoverTimes", {
                        times: workingCapital.inventoryTurnover.toFixed(1),
                      })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("financials.dio")}</span>
                <span className="tabular-nums">
                  {workingCapital.daysInventoryOutstanding === null
                    ? "—"
                    : t("financials.dioDays", {
                        days: Math.round(workingCapital.daysInventoryOutstanding),
                      })}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("financials.trendTitle")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("financials.trendSubtitle")}</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.series} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={CHART_INK.gridline} />
              <XAxis
                dataKey="date"
                stroke={CHART_INK.muted}
                fontSize={11}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis stroke={CHART_INK.muted} fontSize={11} width={64} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(value) => formatMoney(Number(value ?? 0), cur)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="netRevenue"
                name={t("financials.netRevenue")}
                stroke="var(--color-primary)"
                fill="url(#revFill)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="grossProfit"
                name={t("financials.grossProfit")}
                stroke="var(--color-success)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="netProfit"
                name={t("financials.netProfit")}
                stroke="var(--color-warning)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("financials.costBaseTitle")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("financials.costBaseSubtitle")}</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("financials.colCategory")}</TableHead>
                <TableHead>{t("financials.colLabel")}</TableHead>
                <TableHead className="text-end">{t("financials.colAmount")}</TableHead>
                <TableHead>{t("financials.colFrequency")}</TableHead>
                <TableHead className="text-end">{t("financials.colMonthly")}</TableHead>
                <TableHead>{t("financials.colStatus")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {costBase.expenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {t("financials.noExpenses")}
                  </TableCell>
                </TableRow>
              ) : (
                costBase.expenses.map((e) => {
                  const amount = Number(e.amount);
                  const monthly =
                    e.frequency === "one_time"
                      ? null
                      : (amount / FREQ_DIVISOR[e.frequency]) * DAYS_PER_MONTH;
                  return (
                    <TableRow key={e.id} className={e.isActive ? "" : "opacity-60"}>
                      <TableCell>{t(CATEGORY_KEY[e.category])}</TableCell>
                      <TableCell className="font-medium">{e.label}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatMoney(amount, cur)}
                      </TableCell>
                      <TableCell>{t(FREQUENCY_KEY[e.frequency])}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {monthly === null ? "—" : formatMoney(monthly, cur)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.isActive ? "success" : "outline"}>
                          {e.isActive ? t("common.active") : t("financials.closed")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end">
                        {e.isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={closeMutation.isPending}
                            onClick={() => closeMutation.mutate(e.id)}
                          >
                            {t("financials.closeExpense")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
