"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronDown, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";

import {
  listCategories,
  listColors,
  listGenders,
  listProductTypes,
  listSizes,
  quickAddProduct,
} from "@/lib/api/catalog";
import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

/** Mirrors MAX_QUICK_ADD_VARIANTS in the backend ProductsService. */
const MAX_VARIANTS = 200;

const schema = z.object({
  modelName: z.string().min(1, "Required"),
  categoryId: z.string().min(1, "Required"),
  genderId: z.string().min(1, "Required"),
  productTypeId: z.string().min(1, "Required"),
  brand: z.string().optional(),
  baseCostPrice: z.coerce.number().min(0),
  baseSellingPrice: z.coerce.number().min(0),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  openingQuantity: z.coerce.number().int().min(0),
  reorderPoint: z.coerce.number().int().min(0),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  modelName: "",
  categoryId: "",
  genderId: "",
  productTypeId: "",
  brand: "",
  baseCostPrice: 0,
  baseSellingPrice: 0,
  description: "",
  imageUrl: "",
  openingQuantity: 10,
  reorderPoint: 5,
};

/** Multi-select chip row — the whole point of quick-add is picking many at once. */
function ChipToggle({
  label,
  selected,
  onClick,
  swatch,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  swatch?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "hover:border-primary hover:bg-accent"
      }`}
    >
      {swatch && (
        <span
          className="size-3 shrink-0 rounded-full border border-black/20"
          style={{ backgroundColor: swatch }}
        />
      )}
      {label}
    </button>
  );
}

export function QuickAddProductDialog() {
  const { t } = useLocale();
  const { activeStore, activeStoreId } = useActiveStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: genders } = useQuery({ queryKey: ["genders"], queryFn: listGenders });
  const { data: productTypes } = useQuery({ queryKey: ["product-types"], queryFn: listProductTypes });
  const { data: sizes } = useQuery({ queryKey: ["sizes"], queryFn: listSizes });
  const { data: colors } = useQuery({ queryKey: ["colors"], queryFn: listColors });

  const [sizeIds, setSizeIds] = React.useState<string[]>([]);
  const [colorIds, setColorIds] = React.useState<string[]>([]);
  const [overrides, setOverrides] = React.useState<Record<string, number>>({});
  const [showGrid, setShowGrid] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: EMPTY,
  });

  // watch() yields the raw input string (zod's coerce only runs at validation), so this
  // must be cast before any arithmetic — otherwise `0 + "12"` concatenates into "012".
  const defaultQty = Number(form.watch("openingQuantity")) || 0;

  // Sizes come back mixed-standard (EU/UK/US); grouping keeps the picker scannable.
  const sizeGroups = React.useMemo(() => {
    const groups = new Map<string, typeof sizes>();
    for (const s of sizes ?? []) {
      const list = groups.get(s.standard) ?? [];
      list.push(s);
      groups.set(s.standard, list);
    }
    return Array.from(groups.entries()).map(([standard, items]) => ({
      standard,
      items: (items ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  }, [sizes]);

  const selectedSizes = (sizes ?? []).filter((s) => sizeIds.includes(s.id));
  const selectedColors = (colors ?? []).filter((c) => colorIds.includes(c.id));
  const variantCount = sizeIds.length * colorIds.length;
  const totalUnits = React.useMemo(() => {
    if (variantCount === 0) return 0;
    return sizeIds.reduce(
      (sum, sizeId) =>
        sum +
        colorIds.reduce(
          (inner, colorId) => inner + (overrides[`${sizeId}:${colorId}`] ?? defaultQty ?? 0),
          0,
        ),
      0,
    );
  }, [sizeIds, colorIds, overrides, defaultQty, variantCount]);

  const tooMany = variantCount > MAX_VARIANTS;

  function reset() {
    form.reset(EMPTY);
    setSizeIds([]);
    setColorIds([]);
    setOverrides({});
    setShowGrid(false);
  }

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      quickAddProduct({
        modelName: values.modelName,
        categoryId: values.categoryId,
        genderId: values.genderId,
        productTypeId: values.productTypeId,
        brand: values.brand || undefined,
        baseCostPrice: values.baseCostPrice,
        baseSellingPrice: values.baseSellingPrice,
        description: values.description || undefined,
        imageUrl: values.imageUrl || undefined,
        storeId: activeStoreId!,
        sizeValueIds: sizeIds,
        colorIds,
        openingQuantity: values.openingQuantity,
        reorderPoint: values.reorderPoint,
        variantQuantities: Object.entries(overrides).map(([key, quantity]) => {
          const [sizeValueId, colorId] = key.split(":");
          return { sizeValueId, colorId, quantity };
        }),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["pos-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-value"] });
      toast.success(
        t("products.quickAdd.created", {
          product: result.product.modelName,
          variants: result.variantCount,
          units: result.unitsAdded,
        }),
      );
      setOpen(false);
      reset();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("products.quickAdd.failed")),
  });

  function onSubmit(values: FormValues) {
    if (sizeIds.length === 0) return toast.error(t("products.quickAdd.pickSizes"));
    if (colorIds.length === 0) return toast.error(t("products.quickAdd.pickColors"));
    if (tooMany) {
      return toast.error(
        t("products.quickAdd.tooManyVariants", { count: variantCount, max: MAX_VARIANTS }),
      );
    }
    mutation.mutate(values);
  }

  // Functional update, not `set(list.filter(...))` — several toggles can land before a
  // re-render, and reading `list` from the closure would drop all but the last one.
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, id: string) =>
    set((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={!activeStoreId}>
          <Zap className="size-4" />
          {t("products.quickAdd.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("products.quickAdd.title")}</DialogTitle>
          <DialogDescription>
            {t("products.quickAdd.description")}
            {activeStore && (
              <>
                {" "}
                <span className="font-medium text-foreground">
                  {t("products.quickAdd.storeLabel")}: {activeStore.name}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-sm font-medium">{t("products.quickAdd.sectionDetails")}</p>

            <div className="grid gap-3 sm:grid-cols-2">
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
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
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

            <div className="grid gap-3 sm:grid-cols-3">
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
              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.quickAdd.imageUrlOptional")}</FormLabel>
                    <FormControl>
                      <Input placeholder="https://…" {...field} />
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

            <Separator />

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t("products.quickAdd.sectionSizes")}</p>
              {sizeIds.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSizeIds([])}>
                  {t("products.quickAdd.clear")}
                </Button>
              )}
            </div>
            {sizeGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("products.quickAdd.noSizesYet")}</p>
            ) : (
              <div className="space-y-2">
                {sizeGroups.map((group) => (
                  <div key={group.standard} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {group.standard}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() =>
                          setSizeIds((prev) =>
                            Array.from(new Set([...prev, ...group.items.map((s) => s.id)])),
                          )
                        }
                      >
                        {t("products.quickAdd.selectAll")}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((s) => (
                        <ChipToggle
                          key={s.id}
                          label={s.value}
                          selected={sizeIds.includes(s.id)}
                          onClick={() => toggle(setSizeIds, s.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t("products.quickAdd.sectionColors")}</p>
              {colorIds.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setColorIds([])}>
                  {t("products.quickAdd.clear")}
                </Button>
              )}
            </div>
            {(colors ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("products.quickAdd.noColorsYet")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {colors?.map((c) => (
                  <ChipToggle
                    key={c.id}
                    label={c.name}
                    swatch={c.hexCode}
                    selected={colorIds.includes(c.id)}
                    onClick={() => toggle(setColorIds, c.id)}
                  />
                ))}
              </div>
            )}

            <Separator />

            <p className="text-sm font-medium">{t("products.quickAdd.sectionStock")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="openingQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.quickAdd.qtyPerVariant")}</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="1" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{t("products.quickAdd.qtyHint")}</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reorderPoint"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.quickAdd.reorderPoint")}</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {variantCount > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2.5">
                  <Badge variant={tooMany ? "destructive" : "secondary"}>
                    {t("products.quickAdd.summary", {
                      sizes: sizeIds.length,
                      colors: colorIds.length,
                      variants: variantCount,
                      units: totalUnits,
                    })}
                  </Badge>
                  {tooMany && (
                    <span className="text-xs text-destructive">
                      {t("products.quickAdd.tooManyVariants", {
                        count: variantCount,
                        max: MAX_VARIANTS,
                      })}
                    </span>
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between"
                  onClick={() => setShowGrid((v) => !v)}
                >
                  {t("products.quickAdd.fineTune")}
                  <ChevronDown className={`size-4 transition ${showGrid ? "rotate-180" : ""}`} />
                </Button>

                {showGrid && !tooMany && (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="p-2 text-start font-medium"> </th>
                          {selectedColors.map((c) => (
                            <th key={c.id} className="p-2 text-center text-xs font-medium">
                              {c.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSizes.map((s) => (
                          <tr key={s.id} className="border-b last:border-0">
                            <td className="p-2 text-xs font-medium whitespace-nowrap">
                              {s.standard} {s.value}
                            </td>
                            {selectedColors.map((c) => {
                              const key = `${s.id}:${c.id}`;
                              return (
                                <td key={c.id} className="p-1">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={overrides[key] ?? defaultQty ?? 0}
                                    onChange={(e) =>
                                      setOverrides((prev) => ({
                                        ...prev,
                                        [key]: Math.max(0, Number(e.target.value)),
                                      }))
                                    }
                                    className="h-8 w-16 text-center"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            <DialogFooter>
              <Button
                type="submit"
                disabled={mutation.isPending || variantCount === 0 || tooMany || !activeStoreId}
              >
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("products.quickAdd.submit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
