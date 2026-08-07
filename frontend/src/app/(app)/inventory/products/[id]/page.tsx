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
import { formatDateTime, formatMoney } from "@/lib/format";
import { useLocale } from "@/lib/i18n/locale-context";
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
  const { t } = useLocale();
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
      toast.success(t("productDetail.variantAdded"));
      setOpen(false);
      form.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("productDetail.addVariantFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          {t("productDetail.addVariant")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("productDetail.addVariantTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="sizeValueId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("productDetail.size")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("common.selectPlaceholder")} />
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
                    <FormLabel>{t("productDetail.color")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("common.selectPlaceholder")} />
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
                  <FormLabel>{t("productDetail.barcode")}</FormLabel>
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
                  <FormLabel>{t("productDetail.reorderPoint")}</FormLabel>
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
                {t("productDetail.addVariant")}
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
  const { t } = useLocale();
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
      toast.success(t("productDetail.priceUpdated"));
      setOpen(false);
      form.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("productDetail.updatePriceFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {t("productDetail.updatePrice")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("productDetail.updatePriceTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="variantId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("productDetail.scope")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="base">{t("productDetail.baseProductPrice")}</SelectItem>
                      {variants.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {t("productDetail.variantOverridePrefix")} {v.barcode}
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
                  <FormLabel>{t("productDetail.field")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cost_price">{t("productDetail.costPrice")}</SelectItem>
                      <SelectItem value="selling_price">{t("productDetail.sellingPrice")}</SelectItem>
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
                  <FormLabel>{t("productDetail.newValue")}</FormLabel>
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
                  <FormLabel>{t("productDetail.reasonOptional")}</FormLabel>
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
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductDetailPage() {
  const { t } = useLocale();
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
            <CardTitle className="text-sm text-muted-foreground">{t("productDetail.baseCostPrice")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatMoney(product.baseCostPrice)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{t("productDetail.baseSellingPrice")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatMoney(product.baseSellingPrice)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{t("productDetail.variants")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {product.variants?.length ?? 0}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="variants">
        <TabsList>
          <TabsTrigger value="variants">{t("productDetail.variantsTab")}</TabsTrigger>
          <TabsTrigger value="history">{t("productDetail.historyTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="variants" className="space-y-3">
          <div className="flex justify-end">
            <AddVariantDialog productId={productId} />
          </div>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("productDetail.colBarcode")}</TableHead>
                  <TableHead>{t("productDetail.colSize")}</TableHead>
                  <TableHead>{t("productDetail.colColor")}</TableHead>
                  <TableHead className="text-end">{t("productDetail.colCostOverride")}</TableHead>
                  <TableHead className="text-end">{t("productDetail.colSellingOverride")}</TableHead>
                  <TableHead className="text-end">{t("productDetail.colReorderPoint")}</TableHead>
                  <TableHead>{t("productDetail.colStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(product.variants ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      {t("productDetail.noVariantsYet")}
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
                      <TableCell className="text-end">
                        {v.costPriceOverride ? formatMoney(v.costPriceOverride) : "—"}
                      </TableCell>
                      <TableCell className="text-end">
                        {v.sellingPriceOverride ? formatMoney(v.sellingPriceOverride) : "—"}
                      </TableCell>
                      <TableCell className="text-end">{v.reorderPoint}</TableCell>
                      <TableCell>
                        <Badge variant={v.isActive ? "success" : "outline"}>
                          {v.isActive ? t("common.active") : t("common.inactive")}
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
                  <TableHead>{t("productDetail.colDate")}</TableHead>
                  <TableHead>{t("productDetail.colField")}</TableHead>
                  <TableHead>{t("productDetail.colScope")}</TableHead>
                  <TableHead className="text-end">{t("productDetail.colOld")}</TableHead>
                  <TableHead className="text-end">{t("productDetail.colNew")}</TableHead>
                  <TableHead>{t("productDetail.colChangedBy")}</TableHead>
                  <TableHead>{t("productDetail.colReason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!priceHistory || priceHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      {t("productDetail.noPriceHistory")}
                    </TableCell>
                  </TableRow>
                ) : (
                  priceHistory.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{formatDateTime(h.effectiveAt)}</TableCell>
                      <TableCell>
                        {h.field === "cost_price" ? t("productDetail.costPrice") : t("productDetail.sellingPrice")}
                      </TableCell>
                      <TableCell>{h.variantId ? t("productDetail.scopeVariant") : t("productDetail.scopeBase")}</TableCell>
                      <TableCell className="text-end">
                        {h.oldValue ? formatMoney(h.oldValue) : "—"}
                      </TableCell>
                      <TableCell className="text-end">{formatMoney(h.newValue)}</TableCell>
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
