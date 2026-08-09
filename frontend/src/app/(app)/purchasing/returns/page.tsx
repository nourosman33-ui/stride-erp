"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { createPurchaseReturn, listPurchaseReturns, reversePurchaseReturn } from "@/lib/api/purchasing";
import { useAuth } from "@/lib/auth-context";
import { useActiveStore } from "@/lib/store-context";
import { useVariantCatalog } from "@/lib/hooks/use-variant-catalog";
import { useLocale } from "@/lib/i18n/locale-context";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { VariantPicker } from "@/components/variant-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";

const schema = z.object({
  variantId: z.string().min(1, "Select a variant"),
  quantity: z.coerce.number().int().positive(),
  reason: z.string().min(1, "Reason is required"),
});
type FormValues = z.infer<typeof schema>;

/** Undoes a purchase return: posts stock back, removes the return document. Owner only. */
function ReverseReturnButton({ id, storeId }: { id: string; storeId: string }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const mutation = useMutation({
    mutationFn: () => reversePurchaseReturn(id, storeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-returns"] });
      queryClient.invalidateQueries({ queryKey: ["stock-on-hand"] });
      toast.success(t("purchaseReturns.reversed"));
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("purchaseReturns.reverseFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          {t("common.reverse")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("purchaseReturns.reverseConfirmTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("purchaseReturns.reverseConfirmBody")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("common.reverse")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PurchaseReturnsPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { variants } = useVariantCatalog();
  const { hasRole } = useAuth();
  const { t } = useLocale();
  const queryClient = useQueryClient();

  const { data: returns, isLoading: returnsLoading } = useQuery({
    queryKey: ["purchase-returns", activeStoreId],
    queryFn: () => listPurchaseReturns(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: { variantId: "", quantity: 1, reason: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createPurchaseReturn({ storeId: activeStoreId!, ...values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-on-hand"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-returns", activeStoreId] });
      toast.success(t("purchaseReturns.recorded"));
      form.reset({ variantId: "", quantity: 1, reason: "" });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("purchaseReturns.recordFailed")),
  });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("purchaseReturns.title")} description={t("purchaseReturns.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("purchaseReturns.title")} description={t("purchaseReturns.descriptionLong")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("purchaseReturns.newReturn")}</CardTitle>
            <CardDescription>{activeStore?.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="variantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchaseReturns.variant")}</FormLabel>
                      <FormControl>
                        <VariantPicker variants={variants} value={field.value || null} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchaseReturns.quantity")}</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchaseReturns.reason")}</FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder={t("purchaseReturns.reasonPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={mutation.isPending} className="w-full">
                  {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                  {t("purchaseReturns.recordReturn")}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("purchaseReturns.recordedThisSession")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {returnsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !returns || returns.length === 0 ? (
              <Alert>
                <AlertTitle>{t("purchaseReturns.noReturnsTitle")}</AlertTitle>
                <AlertDescription>{t("purchaseReturns.noReturnsDesc")}</AlertDescription>
              </Alert>
            ) : (
              <ul className="divide-y">
                {returns.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="font-medium">
                        {r.variant?.product?.modelName ?? r.variantId}
                        {r.variant && ` — ${r.variant.color?.name ?? ""} / ${r.variant.sizeValue?.value ?? ""}`}
                        {" × "}
                        {r.quantity}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(r.createdAt)}
                        {r.createdBy && ` · ${r.createdBy.fullName}`}
                      </p>
                    </div>
                    {hasRole("owner") && activeStoreId && (
                      <ReverseReturnButton id={r.id} storeId={activeStoreId} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
