"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createPurchaseOrder, listPurchaseOrders } from "@/lib/api/purchasing";
import { listSuppliers } from "@/lib/api/suppliers";
import { useVariantCatalog } from "@/lib/hooks/use-variant-catalog";
import { useActiveStore } from "@/lib/store-context";
import { formatDate, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { PoStatusBadge } from "@/components/status-badge";
import { VariantPicker } from "@/components/variant-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const lineSchema = z.object({
  variantId: z.string().min(1, "Select a variant"),
  quantityOrdered: z.coerce.number().int().positive(),
  costPrice: z.coerce.number().min(0),
  sellingPriceAtOrder: z.coerce.number().min(0),
});

const schema = z.object({
  supplierId: z.string().min(1, "Select a supplier"),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});
type FormValues = z.infer<typeof schema>;

function NewPurchaseOrderDialog({ storeId }: { storeId: string }) {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: listSuppliers });
  const { variants } = useVariantCatalog();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      supplierId: "",
      expectedDeliveryDate: "",
      notes: "",
      lines: [{ variantId: "", quantityOrdered: 1, costPrice: 0, sellingPriceAtOrder: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const lines = form.watch("lines");
  const orderTotal = lines.reduce((sum, l) => sum + (l.costPrice || 0) * (l.quantityOrdered || 0), 0);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createPurchaseOrder({
        storeId,
        supplierId: values.supplierId,
        expectedDeliveryDate: values.expectedDeliveryDate || undefined,
        notes: values.notes || undefined,
        lines: values.lines,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Purchase order created");
      setOpen(false);
      form.reset({
        supplierId: "",
        expectedDeliveryDate: "",
        notes: "",
        lines: [{ variantId: "", quantityOrdered: 1, costPrice: 0, sellingPriceAtOrder: 0 }],
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create purchase order"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          New Purchase Order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a supplier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliers?.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
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
                name="expectedDeliveryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected delivery (optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FormLabel>Lines</FormLabel>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    append({ variantId: "", quantityOrdered: 1, costPrice: 0, sellingPriceAtOrder: 0 })
                  }
                >
                  <Plus className="size-4" />
                  Add line
                </Button>
              </div>

              {fields.map((field, index) => (
                <div key={field.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <FormField
                        control={form.control}
                        name={`lines.${index}.variantId`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormControl>
                              <VariantPicker
                                variants={variants}
                                value={f.value || null}
                                onChange={(id) => {
                                  f.onChange(id);
                                  const v = variants.find((x) => x.variantId === id);
                                  if (v) {
                                    form.setValue(`lines.${index}.costPrice`, v.costPrice);
                                    form.setValue(`lines.${index}.sellingPriceAtOrder`, v.sellingPrice);
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <FormField
                      control={form.control}
                      name={`lines.${index}.quantityOrdered`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Qty</FormLabel>
                          <FormControl>
                            <Input type="number" min="1" {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`lines.${index}.costPrice`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Cost price</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0" {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`lines.${index}.sellingPriceAtOrder`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Selling price</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0" {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between border-t pt-3">
              <p className="text-sm text-muted-foreground">
                Order total: <span className="font-semibold text-foreground">{formatMoney(orderTotal)}</span>
              </p>
              <DialogFooter className="!mt-0">
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Create order
                </Button>
              </DialogFooter>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function PurchaseOrdersPage() {
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["purchase-orders", activeStoreId],
    queryFn: () => listPurchaseOrders(activeStoreId!),
    enabled: !!activeStoreId,
  });

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title="Purchase Orders" description="Orders placed with suppliers" />
        <NoStoreSelected />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchase Orders"
        description={activeStore?.name}
        actions={activeStoreId ? <NewPurchaseOrderDialog storeId={activeStoreId} /> : undefined}
      />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Order date</TableHead>
              <TableHead>Expected delivery</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : !orders || orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No purchase orders yet.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((po) => {
                const total = (po.lines ?? []).reduce((sum, l) => sum + Number(l.lineTotal), 0);
                return (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">
                      <Link href={`/purchasing/orders/${po.id}`} className="hover:underline">
                        {po.supplier?.name ?? po.supplierId}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(po.orderDate)}</TableCell>
                    <TableCell>{formatDate(po.expectedDeliveryDate)}</TableCell>
                    <TableCell>
                      <PoStatusBadge status={po.status} />
                    </TableCell>
                    <TableCell className="text-right">{po.lines?.length ?? 0}</TableCell>
                    <TableCell className="text-right font-medium">{formatMoney(total)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
