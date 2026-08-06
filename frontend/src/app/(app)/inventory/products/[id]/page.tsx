"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  addVariant,
  getPriceHistory,
  getProduct,
  listColors,
  listSizes,
  updatePrice,
} from "@/lib/api/catalog";
import { formatDateTime, formatMoney, titleCase } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const variantSchema = z.object({
  sizeValueId: z.string().min(1, "Required"),
  colorId: z.string().min(1, "Required"),
  barcode: z.string().optional(),
  reorderPoint: z.coerce.number().int().min(0).default(0),
});
type VariantFormValues = z.infer<typeof variantSchema>;

function AddVariantDialog({ productId }: { productId: string }) {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const { data: sizes } = useQuery({ queryKey: ["sizes"], queryFn: listSizes });
  const { data: colors } = useQuery({ queryKey: ["colors"], queryFn: listColors });

  const form = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema) as Resolver<VariantFormValues>,
    defaultValues: { sizeValueId: "", colorId: "", barcode: "", reorderPoint: 0 },
  });

  const mutation = useMutation({
    mutationFn: (values: VariantFormValues) =>
      addVariant(productId, { ...values, barcode: values.barcode || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Variant added");
      setOpen(false);
      form.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to add variant"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Add variant
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add variant</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="sizeValueId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Size</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sizes?.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.standard} {s.value}
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
                name="colorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {colors?.map((c) => (
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
            </div>
            <FormField
              control={form.control}
              name="barcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Barcode (optional — auto-generated if blank)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reorderPoint"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reorder point</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Add variant
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const priceSchema = z.object({
  field: z.enum(["cost_price", "selling_price"]),
  newValue: z.coerce.number().min(0),
  variantId: z.string().optional(),
  reason: z.string().optional(),
});
type PriceFormValues = z.infer<typeof priceSchema>;

function UpdatePriceDialog({
  productId,
  variants,
}: {
  productId: string;
  variants: { id: string; barcode: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const form = useForm<PriceFormValues>({
    resolver: zodResolver(priceSchema) as Resolver<PriceFormValues>,
    defaultValues: { field: "selling_price", newValue: 0, variantId: "base", reason: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: PriceFormValues) =>
      updatePrice(productId, {
        ...values,
        variantId: values.variantId === "base" ? undefined : values.variantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
      queryClient.invalidateQueries({ queryKey: ["price-history", productId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Price updated");
      setOpen(false);
      form.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update price"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Update price
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update price</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="variantId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Scope</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="base">Base product price</SelectItem>
                      {variants.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          Variant override — {v.barcode}
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
              name="field"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Field</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cost_price">Cost price</SelectItem>
                      <SelectItem value="selling_price">Selling price</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New value</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} />
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
                  <FormLabel>Reason (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => getProduct(productId),
  });

  const { data: priceHistory } = useQuery({
    queryKey: ["price-history", productId],
    queryFn: () => getPriceHistory(productId),
  });

  if (isLoading || !product) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={product.modelName}
        description={`${product.category?.name ?? ""} · ${product.gender?.name ?? ""} · ${product.productType?.name ?? ""}`}
        actions={
          <UpdatePriceDialog
            productId={productId}
            variants={(product.variants ?? []).map((v) => ({ id: v.id, barcode: v.barcode }))}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Base cost price</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatMoney(product.baseCostPrice)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Base selling price</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatMoney(product.baseSellingPrice)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Variants</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {product.variants?.length ?? 0}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="variants">
        <TabsList>
          <TabsTrigger value="variants">Variants</TabsTrigger>
          <TabsTrigger value="history">Price History</TabsTrigger>
        </TabsList>

        <TabsContent value="variants" className="space-y-3">
          <div className="flex justify-end">
            <AddVariantDialog productId={productId} />
          </div>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="text-right">Cost override</TableHead>
                  <TableHead className="text-right">Selling override</TableHead>
                  <TableHead className="text-right">Reorder point</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(product.variants ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No variants yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  product.variants!.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">{v.barcode}</TableCell>
                      <TableCell>
                        {v.sizeValue ? `${v.sizeValue.standard} ${v.sizeValue.value}` : "—"}
                      </TableCell>
                      <TableCell>{v.color?.name ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {v.costPriceOverride ? formatMoney(v.costPriceOverride) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {v.sellingPriceOverride ? formatMoney(v.sellingPriceOverride) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{v.reorderPoint}</TableCell>
                      <TableCell>
                        <Badge variant={v.isActive ? "success" : "outline"}>
                          {v.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Old</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead>Changed by</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!priceHistory || priceHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No price changes recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  priceHistory.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{formatDateTime(h.effectiveAt)}</TableCell>
                      <TableCell>{titleCase(h.field)}</TableCell>
                      <TableCell>{h.variantId ? "Variant" : "Base"}</TableCell>
                      <TableCell className="text-right">
                        {h.oldValue ? formatMoney(h.oldValue) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{formatMoney(h.newValue)}</TableCell>
                      <TableCell>{h.changedBy?.fullName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{h.reason ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
