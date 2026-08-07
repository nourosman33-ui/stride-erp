"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createAdjustment, getStockOnHand } from "@/lib/api/inventory";
import { useActiveStore } from "@/lib/store-context";
import { useVariantCatalog } from "@/lib/hooks/use-variant-catalog";
import { useLocale } from "@/lib/i18n/locale-context";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { VariantPicker } from "@/components/variant-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
  variantId: z.string().min(1, "Select a variant"),
  direction: z.enum(["increase", "decrease"]),
  quantity: z.coerce.number().int().positive("Must be greater than zero"),
  reasonCode: z.string().min(1, "Select a reason"),
});
type FormValues = z.infer<typeof schema>;

export default function AdjustmentsPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { variants, isLoading: variantsLoading } = useVariantCatalog();
  const { t } = useLocale();
  const queryClient = useQueryClient();

  const REASON_CODES = [
    { value: "count_correction", label: t("adjustments.reasonCountCorrection") },
    { value: "damage", label: t("adjustments.reasonDamage") },
    { value: "theft", label: t("adjustments.reasonTheft") },
    { value: "found", label: t("adjustments.reasonFound") },
    { value: "other", label: t("adjustments.reasonOther") },
  ];

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: { variantId: "", direction: "decrease", quantity: 1, reasonCode: "" },
  });

  const watchedVariantId = form.watch("variantId");

  const { data: currentQty } = useQuery({
    queryKey: ["stock-on-hand-single", activeStoreId, watchedVariantId],
    queryFn: () => getStockOnHand(activeStoreId!, watchedVariantId),
    enabled: !!activeStoreId && !!watchedVariantId,
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createAdjustment({
        storeId: activeStoreId!,
        variantId: values.variantId,
        quantityDelta: values.direction === "decrease" ? -values.quantity : values.quantity,
        reasonCode: values.reasonCode,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-on-hand"] });
      queryClient.invalidateQueries({ queryKey: ["reorder-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["stock-on-hand-single"] });
      toast.success(t("adjustments.posted"));
      form.reset({ variantId: "", direction: "decrease", quantity: 1, reasonCode: "" });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("adjustments.postFailed")),
  });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("adjustments.title")} description={t("adjustments.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("adjustments.title")} description={t("adjustments.description")} />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">{t("adjustments.newAdjustment")}</CardTitle>
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
                    <FormLabel>{t("adjustments.variant")}</FormLabel>
                    <FormControl>
                      <VariantPicker
                        variants={variants}
                        value={field.value || null}
                        onChange={field.onChange}
                        disabled={variantsLoading}
                      />
                    </FormControl>
                    {watchedVariantId && currentQty !== undefined && (
                      <FormDescription>{t("adjustments.currentlyOnHand", { count: currentQty })}</FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="direction"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adjustments.direction")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="decrease">{t("adjustments.decrease")}</SelectItem>
                          <SelectItem value="increase">{t("adjustments.increase")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adjustments.quantity")}</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="reasonCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adjustments.reason")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("adjustments.reasonPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {REASON_CODES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={mutation.isPending} className="w-full">
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("adjustments.postAdjustment")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
