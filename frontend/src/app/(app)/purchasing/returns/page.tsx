"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { createPurchaseReturn } from "@/lib/api/purchasing";
import { useActiveStore } from "@/lib/store-context";
import { useVariantCatalog } from "@/lib/hooks/use-variant-catalog";
import { useLocale } from "@/lib/i18n/locale-context";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { VariantPicker } from "@/components/variant-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatDateTime } from "@/lib/format";

const schema = z.object({
  variantId: z.string().min(1, "Select a variant"),
  quantity: z.coerce.number().int().positive(),
  reason: z.string().min(1, "Reason is required"),
});
type FormValues = z.infer<typeof schema>;

interface LoggedReturn {
  id: string;
  variantLabel: string;
  quantity: number;
  reason: string;
  createdAt: string;
}

export default function PurchaseReturnsPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { variants } = useVariantCatalog();
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [recent, setRecent] = React.useState<LoggedReturn[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: { variantId: "", quantity: 1, reason: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createPurchaseReturn({ storeId: activeStoreId!, ...values }),
    onSuccess: (result, values) => {
      queryClient.invalidateQueries({ queryKey: ["stock-on-hand"] });
      const variant = variants.find((v) => v.variantId === values.variantId);
      setRecent((prev) => [
        {
          id: result.id,
          variantLabel: variant
            ? `${variant.productName} — ${variant.colorName} / ${variant.sizeLabel}`
            : values.variantId,
          quantity: values.quantity,
          reason: values.reason,
          createdAt: result.createdAt,
        },
        ...prev,
      ]);
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
            {recent.length === 0 ? (
              <Alert>
                <AlertTitle>{t("purchaseReturns.noReturnsTitle")}</AlertTitle>
                <AlertDescription>{t("purchaseReturns.noReturnsDesc")}</AlertDescription>
              </Alert>
            ) : (
              <ul className="divide-y">
                {recent.map((r) => (
                  <li key={r.id} className="py-2 text-sm">
                    <p className="font-medium">
                      {r.variantLabel} × {r.quantity}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.reason}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</p>
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
