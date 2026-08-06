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

const REASON_CODES = [
  { value: "count_correction", label: "Stock count correction" },
  { value: "damage", label: "Damage" },
  { value: "theft", label: "Theft / loss" },
  { value: "found", label: "Found stock" },
  { value: "other", label: "Other" },
];

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
  const queryClient = useQueryClient();

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
      toast.success("Adjustment posted to the stock ledger");
      form.reset({ variantId: "", direction: "decrease", quantity: 1, reasonCode: "" });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to post adjustment"),
  });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title="Stock Adjustments" description="Correct stock counts with an audited reason" />
        <NoStoreSelected />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Adjustments"
        description="Every adjustment posts a signed entry to the append-only stock ledger — never a raw quantity edit."
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">New adjustment</CardTitle>
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
                    <FormLabel>Variant</FormLabel>
                    <FormControl>
                      <VariantPicker
                        variants={variants}
                        value={field.value || null}
                        onChange={field.onChange}
                        disabled={variantsLoading}
                      />
                    </FormControl>
                    {watchedVariantId && currentQty !== undefined && (
                      <FormDescription>Currently {currentQty} on hand.</FormDescription>
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
                      <FormLabel>Direction</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="decrease">Decrease (loss/damage/theft)</SelectItem>
                          <SelectItem value="increase">Increase (found stock)</SelectItem>
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
                      <FormLabel>Quantity</FormLabel>
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
                    <FormLabel>Reason</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a reason" />
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
                Post adjustment
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
