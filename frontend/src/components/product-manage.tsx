"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteProduct,
  getDeletionImpact,
  listCategories,
  listGenders,
  listProductTypes,
  updateProduct,
} from "@/lib/api/catalog";
import type { Product } from "@/lib/api/types";
import { useLocale } from "@/lib/i18n/locale-context";
import { toNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Full edit of a product's details and list prices. */
export function EditProductDialog({ product }: { product: Product }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: genders } = useQuery({ queryKey: ["genders"], queryFn: listGenders });
  const { data: types } = useQuery({ queryKey: ["product-types"], queryFn: listProductTypes });

  const [form, setForm] = React.useState({
    modelName: "",
    brand: "",
    categoryId: "",
    genderId: "",
    productTypeId: "",
    baseCostPrice: "0",
    baseSellingPrice: "0",
    description: "",
    imageUrl: "",
  });

  React.useEffect(() => {
    if (!open) return;
    setForm({
      modelName: product.modelName,
      brand: product.brand ?? "",
      categoryId: product.categoryId,
      genderId: product.genderId,
      productTypeId: product.productTypeId,
      baseCostPrice: String(toNumber(product.baseCostPrice)),
      baseSellingPrice: String(toNumber(product.baseSellingPrice)),
      description: product.description ?? "",
      imageUrl: product.imageUrl ?? "",
    });
  }, [open, product]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      updateProduct(product.id, {
        modelName: form.modelName.trim(),
        brand: form.brand.trim() || undefined,
        categoryId: form.categoryId,
        genderId: form.genderId,
        productTypeId: form.productTypeId,
        baseCostPrice: Number(form.baseCostPrice) || 0,
        baseSellingPrice: Number(form.baseSellingPrice) || 0,
        description: form.description.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", product.id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["pos-catalog"] });
      toast.success(t("manage.productUpdated"));
      setOpen(false);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("manage.productUpdateFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" />
          {t("manage.editProduct")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("manage.editProductTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.modelName.trim()) mutation.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("products.modelName")}</label>
              <Input value={form.modelName} onChange={(e) => set("modelName")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("products.brand")}</label>
              <Input value={form.brand} onChange={(e) => set("brand")(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["categoryId", t("products.category"), categories],
                ["genderId", t("products.gender"), genders],
                ["productTypeId", t("products.type"), types],
              ] as const
            ).map(([key, label, options]) => (
              <div key={key} className="space-y-1.5">
                <label className="text-sm font-medium">{label}</label>
                <Select value={form[key]} onValueChange={set(key)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("products.baseCostPrice")}</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.baseCostPrice}
                onChange={(e) => set("baseCostPrice")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("products.baseSellingPrice")}</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.baseSellingPrice}
                onChange={(e) => set("baseSellingPrice")(e.target.value)}
              />
            </div>
          </div>

          {/* The exact confusion that prompted this feature — said once, where it matters. */}
          <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            {t("manage.priceNote")}
          </p>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("products.quickAdd.imageUrlOptional")}</label>
            <Input value={form.imageUrl} onChange={(e) => set("imageUrl")(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("products.description2")}</label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending || !form.modelName.trim()}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Owner-only delete. Asks the backend what would actually happen first — a product with
 * sales or stock history is deactivated rather than destroyed, and the dialog says which,
 * with the numbers, before anything is committed.
 */
export function DeleteProductButton({ product }: { product: Product }) {
  const { t } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const { data: impact, isLoading } = useQuery({
    queryKey: ["deletion-impact", product.id],
    queryFn: () => getDeletionImpact(product.id),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => deleteProduct(product.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["pos-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["stock-on-hand"] });
      toast.success(
        t(result.mode === "deleted" ? "manage.deleted" : "manage.deactivated", {
          name: result.modelName,
        }),
      );
      setOpen(false);
      router.push("/inventory/products");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("manage.deleteFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10">
          <Trash2 className="size-4" />
          {t("manage.deleteProduct")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("manage.deleteTitle", { name: product.modelName })}</DialogTitle>
          <DialogDescription>
            {isLoading || !impact ? t("manage.deleteChecking") : impact.reason}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !impact ? (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div
              className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
                impact.canHardDelete
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-warning/40 bg-warning/10"
              }`}
            >
              <AlertTriangle
                className={`mt-0.5 size-4 shrink-0 ${
                  impact.canHardDelete ? "text-destructive" : "text-warning"
                }`}
              />
              <span>
                {impact.canHardDelete ? t("manage.willDelete") : t("manage.willDeactivate")}
              </span>
            </div>

            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>· {t("manage.impactVariants", { count: impact.variantCount })}</li>
              <li>· {t("manage.impactSales", { count: impact.salesLines })}</li>
              <li>· {t("manage.impactStock", { count: impact.stockLedgerEntries })}</li>
              <li>· {t("manage.impactPo", { count: impact.purchaseOrderLines })}</li>
            </ul>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("manage.cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {impact.canHardDelete ? t("manage.confirmDelete") : t("manage.confirmDeactivate")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
