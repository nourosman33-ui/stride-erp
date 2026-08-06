import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listColors, listProducts, listSizes } from "@/lib/api/catalog";

export interface FlatVariant {
  variantId: string;
  productId: string;
  barcode: string;
  productName: string;
  sizeLabel: string;
  colorName: string;
  reorderPoint: number;
  costPrice: number;
  sellingPrice: number;
  isActive: boolean;
}

/**
 * Flattens Product -> ProductVariant into a single searchable list.
 * GET /products includes variants but not their sizeValue/color relations
 * (see ProductsService.findAll), so sizes/colors are fetched separately and
 * joined here client-side rather than firing one request per product.
 */
export function useVariantCatalog() {
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const sizesQuery = useQuery({ queryKey: ["sizes"], queryFn: listSizes });
  const colorsQuery = useQuery({ queryKey: ["colors"], queryFn: listColors });

  const isLoading = productsQuery.isLoading || sizesQuery.isLoading || colorsQuery.isLoading;

  const variants = useMemo<FlatVariant[]>(() => {
    if (!productsQuery.data || !sizesQuery.data || !colorsQuery.data) return [];
    const sizeMap = new Map(sizesQuery.data.map((s) => [s.id, s]));
    const colorMap = new Map(colorsQuery.data.map((c) => [c.id, c]));

    const rows: FlatVariant[] = [];
    for (const product of productsQuery.data) {
      for (const variant of product.variants ?? []) {
        const size = sizeMap.get(variant.sizeValueId);
        const color = colorMap.get(variant.colorId);
        rows.push({
          variantId: variant.id,
          productId: product.id,
          barcode: variant.barcode,
          productName: product.modelName,
          sizeLabel: size ? `${size.standard} ${size.value}` : "—",
          colorName: color?.name ?? "—",
          reorderPoint: variant.reorderPoint,
          costPrice: Number(variant.costPriceOverride ?? product.baseCostPrice),
          sellingPrice: Number(variant.sellingPriceOverride ?? product.baseSellingPrice),
          isActive: variant.isActive,
        });
      }
    }
    return rows;
  }, [productsQuery.data, sizesQuery.data, colorsQuery.data]);

  return { variants, isLoading, refetch: productsQuery.refetch };
}
