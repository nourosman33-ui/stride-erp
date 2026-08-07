"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { createProduct, listCategories, listGenders, listProductTypes, listProducts } from "@/lib/api/catalog";
import { formatMoney } from "@/lib/format";
import { useLocale } from "@/lib/i18n/locale-context";
import { PageHeader } from "@/components/layout/page-header";
import { QuickAddProductDialog } from "@/components/quick-add-product-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

const productSchema = z.object({
  modelName: z.string().min(1, "Required"),
  categoryId: z.string().min(1, "Required"),
  genderId: z.string().min(1, "Required"),
  productTypeId: z.string().min(1, "Required"),
  brand: z.string().optional(),
  baseCostPrice: z.coerce.number().min(0),
  baseSellingPrice: z.coerce.number().min(0),
  description: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

function NewProductDialog() {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: genders } = useQuery({ queryKey: ["genders"], queryFn: listGenders });
  const { data: productTypes } = useQuery({ queryKey: ["product-types"], queryFn: listProductTypes });

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema) as Resolver<ProductFormValues>,
    defaultValues: {
      modelName: "",
      categoryId: "",
      genderId: "",
      productTypeId: "",
      brand: "",
      baseCostPrice: 0,
      baseSellingPrice: 0,
      description: "",
    },
  });

  const mutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(t("products.productCreated"));
      setOpen(false);
      form.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("products.createFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="size-4" />
          {t("products.newProduct")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("products.newDialogTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="modelName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("products.modelName")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("products.modelNamePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.category")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("common.selectPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories?.map((c) => (
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
                name="genderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.gender")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("common.selectPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {genders?.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
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
                name="productTypeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.type")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("common.selectPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {productTypes?.map((pt) => (
                          <SelectItem key={pt.id} value={pt.id}>
                            {pt.name}
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
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("products.brand")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="baseCostPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.baseCostPrice")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="baseSellingPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.baseSellingPrice")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("products.description2")}</FormLabel>
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
                {t("products.createProduct")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductsPage() {
  const { t } = useLocale();
  const [search, setSearch] = React.useState("");
  const { data: products, isLoading } = useQuery({ queryKey: ["products"], queryFn: listProducts });

  const filtered = (products ?? []).filter((p) =>
    p.modelName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("products.title")}
        description={t("products.description")}
        actions={
          <>
            <NewProductDialog />
            <QuickAddProductDialog />
          </>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("products.searchPlaceholder")}
          className="ps-8"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("products.colModel")}</TableHead>
              <TableHead>{t("products.colCategory")}</TableHead>
              <TableHead>{t("products.colGender")}</TableHead>
              <TableHead>{t("products.colType")}</TableHead>
              <TableHead className="text-end">{t("products.colCost")}</TableHead>
              <TableHead className="text-end">{t("products.colSelling")}</TableHead>
              <TableHead className="text-end">{t("products.colVariants")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {t("products.noProducts")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/inventory/products/${p.id}`} className="hover:underline">
                      {p.modelName}
                    </Link>
                    {p.brand && <span className="ms-2 text-xs text-muted-foreground">{p.brand}</span>}
                  </TableCell>
                  <TableCell>{p.category?.name ?? "—"}</TableCell>
                  <TableCell>{p.gender?.name ?? "—"}</TableCell>
                  <TableCell>{p.productType?.name ?? "—"}</TableCell>
                  <TableCell className="text-end">{formatMoney(p.baseCostPrice)}</TableCell>
                  <TableCell className="text-end">{formatMoney(p.baseSellingPrice)}</TableCell>
                  <TableCell className="text-end">
                    <Badge variant="secondary">{p.variants?.length ?? 0}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
