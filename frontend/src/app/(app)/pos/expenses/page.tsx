"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Check, Loader2, Pencil, Plus, Search, Tags, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  approveExpense,
  createExpense,
  createExpenseCategory,
  deleteExpense,
  deleteReceipt,
  getExpenseQuickTotals,
  getExpenseWindowAnalytics,
  listExpenseCategories,
  listExpenses,
  rejectExpense,
  updateExpense,
  updateExpenseCategory,
  uploadReceipt,
  type DailyExpense,
  type DailyExpenseCategory,
  type ExpenseQuickPeriod,
  type DailyExpenseStatus,
} from "@/lib/api/expenses";
import { ReceiptViewer } from "@/components/receipt-viewer";
import { listUsers } from "@/lib/api/users";
import type { PaymentMethodType } from "@/lib/api/types";
import { useAuth } from "@/lib/auth-context";
import { useActiveStore } from "@/lib/store-context";
import { useLocale, type TranslationKey } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_KEY } from "@/lib/payment-methods";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { CashFlowCard } from "@/components/financial-dashboard/cash-flow-card";
import { DailyClosingCard } from "@/components/financial-dashboard/daily-closing-card";
import { ExportMenuButton } from "@/components/export-menu-button";
import { PrintOnly } from "@/components/print-document";
import { ReportDocument } from "@/components/report-document";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const PAYMENT_METHODS: PaymentMethodType[] = ["cash", "card", "mobile_wallet", "bank_transfer"];
const STATUS_KEY: Record<DailyExpenseStatus, TranslationKey> = {
  pending: "expenses.statusPending",
  approved: "expenses.statusApproved",
  rejected: "expenses.statusRejected",
};

function nowLocalInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const expenseSchema = z.object({
  categoryId: z.string().min(1),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  paymentMethod: z.enum(["cash", "card", "mobile_wallet", "bank_transfer"]),
  occurredAt: z.string().min(1),
  notes: z.string().optional(),
});
type ExpenseFormValues = z.infer<typeof expenseSchema>;

function ExpenseFormDialog({
  storeId,
  categories,
  expense,
  trigger,
}: {
  storeId: string;
  categories: DailyExpenseCategory[];
  expense?: DailyExpense;
  trigger: React.ReactNode;
}) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [receiptFile, setReceiptFile] = React.useState<File | null>(null);
  const isEdit = !!expense;

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema) as Resolver<ExpenseFormValues>,
    defaultValues: expense
      ? {
          categoryId: expense.categoryId,
          description: expense.description,
          amount: Number(expense.amount),
          paymentMethod: expense.paymentMethod,
          occurredAt: toLocalInputValue(expense.occurredAt),
          notes: expense.notes ?? "",
        }
      : {
          categoryId: "",
          description: "",
          amount: 0,
          paymentMethod: "cash",
          occurredAt: nowLocalInputValue(),
          notes: "",
        },
  });

  const mutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      const payload = { ...values, occurredAt: new Date(values.occurredAt).toISOString() };
      const result = isEdit
        ? await updateExpense(expense!.id, payload)
        : await createExpense({ storeId, ...payload });
      if (receiptFile) await uploadReceipt(result.id, receiptFile);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(isEdit ? t("expenses.expenseUpdated") : t("expenses.expenseCreated"));
      setOpen(false);
      setReceiptFile(null);
      form.reset({
        categoryId: "",
        description: "",
        amount: 0,
        paymentMethod: "cash",
        occurredAt: nowLocalInputValue(),
        notes: "",
      });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t(isEdit ? "expenses.expenseUpdateFailed" : "expenses.expenseCreateFailed")),
  });

  const removeReceiptMutation = useMutation({
    mutationFn: () => deleteReceipt(expense!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(t("expenses.receiptRemoved"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("expenses.actionFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(isEdit ? "expenses.editExpenseTitle" : "expenses.newExpenseTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("expenses.fieldDescription")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("expenses.fieldDescriptionPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("expenses.fieldCategory")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("expenses.fieldCategoryPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
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
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("expenses.fieldAmount")}</FormLabel>
                    <FormControl>
                      <Input type="number" min="0.01" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("expenses.fieldPaymentMethod")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {t(PAYMENT_METHOD_KEY[m])}
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
                name="occurredAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("expenses.fieldOccurredAt")}</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
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
                  <FormLabel>{t("expenses.fieldNotes")}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder={t("expenses.fieldNotesPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
              <FormLabel>{t("expenses.fieldReceipt")}</FormLabel>
              <FormControl>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t("expenses.receiptUploadHint")}</p>
              {isEdit && expense!.receiptStoredName && (
                <div className="flex items-center gap-2 pt-1">
                  <ReceiptViewer expenseId={expense!.id} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive"
                    disabled={removeReceiptMutation.isPending}
                    onClick={() => removeReceiptMutation.mutate()}
                  >
                    {t("expenses.removeReceipt")}
                  </Button>
                </div>
              )}
            </FormItem>
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending} className="w-full">
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {t(isEdit ? "common.save" : "expenses.createExpense")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ expense }: { expense: DailyExpense }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const mutation = useMutation({
    mutationFn: () => rejectExpense(expense.id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(t("expenses.expenseRejected"));
      setOpen(false);
      setReason("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("expenses.actionFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs text-destructive">
          <X className="size-3.5" />
          {t("expenses.reject")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("expenses.rejectDialogTitle")}</DialogTitle>
          <DialogDescription>{expense.description}</DialogDescription>
        </DialogHeader>
        <Textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("expenses.rejectReasonPlaceholder")}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("expenses.reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteExpenseDialog({ expense }: { expense: DailyExpense }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const mutation = useMutation({
    mutationFn: () => deleteExpense(expense.id, reason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(t("expenses.expenseDeleted"));
      setOpen(false);
      setReason("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("expenses.deleteFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive">
          <Trash2 className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("expenses.deleteConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("expenses.deleteConfirmDesc", { description: expense.description })}</DialogDescription>
        </DialogHeader>
        <Textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("expenses.deleteReasonPlaceholder")}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryManager({ categories }: { categories: DailyExpenseCategory[] }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");

  const addMutation = useMutation({
    mutationFn: (n: string) => createExpenseCategory(n),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      toast.success(t("expenses.categoryAdded"));
      setName("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("expenses.categoryAddFailed")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateExpenseCategory(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expense-categories"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : t("expenses.actionFailed")),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Tags className="size-4" />
          {t("expenses.categoriesTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("expenses.categoryNamePlaceholder")}
            className="h-8"
          />
          <Button
            size="sm"
            disabled={!name.trim() || addMutation.isPending}
            onClick={() => addMutation.mutate(name.trim())}
          >
            <Plus className="size-3.5" />
            {t("expenses.addCategory")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <Badge
              key={c.id}
              variant={c.isActive ? "outline" : "secondary"}
              className="cursor-pointer gap-1"
              onClick={() => toggleMutation.mutate({ id: c.id, isActive: !c.isActive })}
            >
              {c.name}
              {!c.isActive && <span className="text-[10px] text-muted-foreground">({t("expenses.retired")})</span>}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ExpensesPage() {
  const { t } = useLocale();
  const { hasRole } = useAuth();
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const elevated = hasRole("owner", "manager");
  const isOwner = hasRole("owner");

  const [period, setPeriod] = React.useState<ExpenseQuickPeriod>("today");
  const [categoryId, setCategoryId] = React.useState<string>("all");
  const [paymentMethod, setPaymentMethod] = React.useState<string>("all");
  const [status, setStatus] = React.useState<string>("all");
  const [userId, setUserId] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");

  const { data: categories } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: listExpenseCategories,
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
    enabled: elevated,
  });

  const { data: quickTotals } = useQuery({
    queryKey: ["expenses", "quick-totals", activeStoreId],
    queryFn: () => getExpenseQuickTotals(activeStoreId!),
    enabled: !!activeStoreId && elevated,
  });

  const { data: windowAnalytics } = useQuery({
    queryKey: ["expenses", "window", activeStoreId, period],
    queryFn: () => getExpenseWindowAnalytics(activeStoreId!, period),
    enabled: !!activeStoreId && elevated,
  });

  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: ["expenses", "list", activeStoreId, period, categoryId, paymentMethod, status, userId],
    queryFn: () =>
      listExpenses({
        storeId: activeStoreId!,
        period,
        categoryId: categoryId === "all" ? undefined : categoryId,
        paymentMethod: paymentMethod === "all" ? undefined : (paymentMethod as PaymentMethodType),
        status: status === "all" ? undefined : (status as DailyExpenseStatus),
        userId: userId === "all" ? undefined : userId,
      }),
    enabled: !!activeStoreId,
  });

  const filteredItems = React.useMemo(() => {
    const items = list?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((e) => e.description.toLowerCase().includes(q) || e.notes?.toLowerCase().includes(q));
  }, [list, search]);

  const queryClient = useQueryClient();
  const approveMutation = useMutation({
    mutationFn: (id: string) => approveExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(t("expenses.expenseApproved"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("expenses.actionFailed")),
  });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("expenses.title")} description={t("expenses.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  const currency = activeStore?.currency;
  const cats = categories ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("expenses.title")}
        description={activeStore?.name}
        actions={
          activeStoreId && (
            <div className="flex items-center gap-2">
              {elevated && (
                <ExportMenuButton
                  kind="expenses"
                  storeId={activeStoreId}
                  params={{ period }}
                  label={t("exports.exportExpenses")}
                  showPrint
                />
              )}
              <ExpenseFormDialog
                storeId={activeStoreId}
                categories={cats}
                trigger={
                  <Button size="sm">
                    <Plus className="size-4" />
                    {t("expenses.addExpense")}
                  </Button>
                }
              />
            </div>
          )
        }
      />

      {list && list.pending.count > 0 && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {t(elevated ? "expenses.pendingCalloutOwnerManager" : "expenses.pendingCalloutCashier", {
              count: list.pending.count,
              amount: formatMoney(list.pending.amount, currency),
            })}
          </AlertTitle>
          <AlertDescription>{t("expenses.cashierScopeNote")}</AlertDescription>
        </Alert>
      )}

      {elevated ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{t("expenses.kpiToday")}</p>
                <p className="text-xl font-semibold tabular-nums">{formatMoney(quickTotals?.today ?? 0, currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{t("expenses.kpiWeek")}</p>
                <p className="text-xl font-semibold tabular-nums">{formatMoney(quickTotals?.week ?? 0, currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{t("expenses.kpiMonth")}</p>
                <p className="text-xl font-semibold tabular-nums">{formatMoney(quickTotals?.month ?? 0, currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{t("expenses.kpiYear")}</p>
                <p className="text-xl font-semibold tabular-nums">{formatMoney(quickTotals?.year ?? 0, currency)}</p>
              </CardContent>
            </Card>
          </div>

          {windowAnalytics && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{t("expenses.kpiAverageDaily")}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatMoney(windowAnalytics.averageDaily, currency)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{t("expenses.kpiHighestDay")}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {windowAnalytics.highestDay ? formatMoney(windowAnalytics.highestDay.amount, currency) : "—"}
                  </p>
                  {windowAnalytics.highestDay && (
                    <p className="text-xs text-muted-foreground">{windowAnalytics.highestDay.date}</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{t("expenses.kpiHighestCategory")}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {windowAnalytics.highestCategory
                      ? formatMoney(windowAnalytics.highestCategory.amount, currency)
                      : "—"}
                  </p>
                  {windowAnalytics.highestCategory && (
                    <p className="text-xs text-muted-foreground">{windowAnalytics.highestCategory.categoryName}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("expenses.yourTotalToday")}</p>
            <p className="text-xl font-semibold tabular-nums">{formatMoney(quickTotals?.today ?? 0, currency)}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={period} onValueChange={(v) => setPeriod(v as ExpenseQuickPeriod)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{t("expenses.filterToday")}</SelectItem>
            <SelectItem value="week">{t("expenses.filterWeek")}</SelectItem>
            <SelectItem value="month">{t("expenses.filterMonth")}</SelectItem>
            <SelectItem value="year">{t("expenses.filterYear")}</SelectItem>
          </SelectContent>
        </Select>

        {elevated && (
          <>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("expenses.filterAllCategories")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("expenses.filterAllCategories")}</SelectItem>
                {cats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("expenses.filterAllMethods")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("expenses.filterAllMethods")}</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(PAYMENT_METHOD_KEY[m])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t("expenses.filterAllStatuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("expenses.filterAllStatuses")}</SelectItem>
                <SelectItem value="pending">{t("expenses.statusPending")}</SelectItem>
                <SelectItem value="approved">{t("expenses.statusApproved")}</SelectItem>
                <SelectItem value="rejected">{t("expenses.statusRejected")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("expenses.filterAllUsers")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("expenses.filterAllUsers")}</SelectItem>
                {(users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <div className="relative ms-auto w-full max-w-xs">
          <Search className="absolute top-1/2 start-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("expenses.filterSearchPlaceholder")}
            className="h-8 ps-8"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("expenses.colDate")}</TableHead>
              <TableHead>{t("expenses.colCategory")}</TableHead>
              <TableHead>{t("expenses.colDescription")}</TableHead>
              <TableHead>{t("expenses.colPaymentMethod")}</TableHead>
              <TableHead>{t("expenses.colAddedBy")}</TableHead>
              <TableHead>{t("expenses.colStatus")}</TableHead>
              <TableHead className="text-end">{t("expenses.colAmount")}</TableHead>
              <TableHead className="text-end">{t("expenses.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {t("expenses.noExpenses")}
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{formatDateTime(e.occurredAt)}</TableCell>
                  <TableCell className="text-xs">{e.category.name}</TableCell>
                  <TableCell>
                    <p className="text-sm">{e.description}</p>
                    {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {t(PAYMENT_METHOD_KEY[e.paymentMethod])}
                  </TableCell>
                  <TableCell className="text-xs">{e.createdBy.fullName}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        e.status === "approved" ? "secondary" : e.status === "rejected" ? "destructive" : "outline"
                      }
                    >
                      {t(STATUS_KEY[e.status])}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end font-medium tabular-nums">
                    {formatMoney(e.amount, currency)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {e.receiptStoredName && <ReceiptViewer expenseId={e.id} />}
                      {elevated && e.status === "pending" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={approveMutation.isPending}
                            onClick={() => approveMutation.mutate(e.id)}
                          >
                            <Check className="size-3.5" />
                            {t("expenses.approve")}
                          </Button>
                          <RejectDialog expense={e} />
                        </>
                      )}
                      {elevated && e.status !== "rejected" && (
                        <ExpenseFormDialog
                          storeId={e.storeId}
                          categories={cats}
                          expense={e}
                          trigger={
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              <Pencil className="size-3.5" />
                            </Button>
                          }
                        />
                      )}
                      {isOwner && <DeleteExpenseDialog expense={e} />}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {elevated && activeStoreId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CashFlowCard storeId={activeStoreId} currency={currency ?? "EGP"} />
          <DailyClosingCard storeId={activeStoreId} currency={currency ?? "EGP"} />
          <CategoryManager categories={cats} />
        </div>
      )}

      <PrintOnly variant="report">
        <ReportDocument
          store={activeStore}
          title={t("reportDoc.expensesTitle")}
          subtitle={t(`expenses.filter${period.charAt(0).toUpperCase()}${period.slice(1)}` as TranslationKey)}
          emptyLabel={t("expenses.noExpenses")}
          columns={[
            { key: "date", label: t("expenses.colDate") },
            { key: "category", label: t("expenses.colCategory") },
            { key: "description", label: t("expenses.colDescription") },
            { key: "method", label: t("expenses.colPaymentMethod") },
            { key: "addedBy", label: t("expenses.colAddedBy") },
            { key: "status", label: t("expenses.colStatus") },
            { key: "amount", label: t("expenses.colAmount"), align: "end" },
          ]}
          rows={filteredItems.map((e) => ({
            date: formatDateTime(e.occurredAt),
            category: e.category.name,
            description: e.description,
            method: t(PAYMENT_METHOD_KEY[e.paymentMethod]),
            addedBy: e.createdBy.fullName,
            status: t(STATUS_KEY[e.status]),
            amount: formatMoney(e.amount, currency),
          }))}
          totals={[
            {
              label: t("reportDoc.totalLabel"),
              value: formatMoney(
                filteredItems.reduce((sum, e) => sum + Number(e.amount), 0),
                currency,
              ),
            },
          ]}
        />
      </PrintOnly>
    </div>
  );
}
