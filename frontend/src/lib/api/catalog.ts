import { apiFetch } from "./client";
import type {
  Category,
  Color,
  Gender,
  PriceHistoryEntry,
  Product,
  ProductType,
  ProductVariant,
  SizeValue,
} from "./types";

export function listCategories() {
  return apiFetch<Category[]>("/catalog/categories");
}
export function createCategory(name: string) {
  return apiFetch<Category>("/catalog/categories", { method: "POST", body: { name } });
}

export function listGenders() {
  return apiFetch<Gender[]>("/catalog/genders");
}
export function createGender(name: string) {
  return apiFetch<Gender>("/catalog/genders", { method: "POST", body: { name } });
}

export function listProductTypes() {
  return apiFetch<ProductType[]>("/catalog/product-types");
}
export function createProductType(name: string) {
  return apiFetch<ProductType>("/catalog/product-types", { method: "POST", body: { name } });
}

export function listColors() {
  return apiFetch<Color[]>("/catalog/colors");
}
export function createColor(name: string, hexCode?: string) {
  return apiFetch<Color>("/catalog/colors", { method: "POST", body: { name, hexCode } });
}

export function listSizes() {
  return apiFetch<SizeValue[]>("/catalog/sizes");
}
export function createSize(standard: string, value: string, sortOrder?: number) {
  return apiFetch<SizeValue>("/catalog/sizes", {
    method: "POST",
    body: { standard, value, sortOrder },
  });
}

export interface CreateProductInput {
  modelName: string;
  categoryId: string;
  genderId: string;
  productTypeId: string;
  brand?: string;
  baseCostPrice: number;
  baseSellingPrice: number;
  description?: string;
  imageUrl?: string;
}

export function listProducts() {
  return apiFetch<Product[]>("/products");
}

export function getProduct(id: string) {
  return apiFetch<Product>(`/products/${id}`);
}

export function createProduct(input: CreateProductInput) {
  return apiFetch<Product>("/products", { method: "POST", body: input });
}

export interface QuickAddProductInput extends CreateProductInput {
  storeId: string;
  sizeValueIds: string[];
  colorIds: string[];
  /** Applied to every combination that has no explicit override. */
  openingQuantity?: number;
  variantQuantities?: { sizeValueId: string; colorId: string; quantity: number }[];
  reorderPoint?: number;
}

export interface QuickAddProductResult {
  product: Product;
  variantCount: number;
  unitsAdded: number;
}

/** Product + every size×color variant + opening stock, in one backend transaction. */
export function quickAddProduct(input: QuickAddProductInput) {
  return apiFetch<QuickAddProductResult>("/products/quick-add", {
    method: "POST",
    body: input,
  });
}

export interface CreateVariantInput {
  sizeValueId: string;
  colorId: string;
  barcode?: string;
  reorderPoint?: number;
}

export function addVariant(productId: string, input: CreateVariantInput) {
  return apiFetch<ProductVariant>(`/products/${productId}/variants`, {
    method: "POST",
    body: input,
  });
}

export function listVariants(productId: string) {
  return apiFetch<ProductVariant[]>(`/products/${productId}/variants`);
}

export interface UpdatePriceInput {
  field: "cost_price" | "selling_price";
  newValue: number;
  variantId?: string;
  reason?: string;
}

export function updatePrice(productId: string, input: UpdatePriceInput) {
  return apiFetch<PriceHistoryEntry>(`/products/${productId}/price`, {
    method: "POST",
    body: input,
  });
}

export function getPriceHistory(productId: string) {
  return apiFetch<PriceHistoryEntry[]>(`/products/${productId}/price-history`);
}

export interface UpdateProductInput {
  modelName?: string;
  categoryId?: string;
  genderId?: string;
  productTypeId?: string;
  brand?: string;
  baseCostPrice?: number;
  baseSellingPrice?: number;
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
}

export function updateProduct(id: string, input: UpdateProductInput) {
  return apiFetch<Product>(`/products/${id}`, { method: "PATCH", body: input });
}

export interface UpdateVariantInput {
  barcode?: string;
  sku?: string;
  costPriceOverride?: number;
  sellingPriceOverride?: number;
  reorderPoint?: number;
  isActive?: boolean;
}

export function updateVariant(variantId: string, input: UpdateVariantInput) {
  return apiFetch<ProductVariant>(`/products/variants/${variantId}`, {
    method: "PATCH",
    body: input,
  });
}

export interface DeletionImpact {
  productId: string;
  modelName: string;
  variantCount: number;
  salesLines: number;
  stockLedgerEntries: number;
  purchaseOrderLines: number;
  /** False when history exists — the product is deactivated rather than destroyed. */
  canHardDelete: boolean;
  reason: string;
}

export function getDeletionImpact(productId: string) {
  return apiFetch<DeletionImpact>(`/products/${productId}/deletion-impact`);
}

export function deleteProduct(productId: string) {
  return apiFetch<{ productId: string; mode: "deleted" | "deactivated"; modelName: string }>(
    `/products/${productId}`,
    { method: "DELETE" },
  );
}

export function deleteVariant(variantId: string) {
  return apiFetch<{ variantId: string; mode: "deleted" | "deactivated" }>(
    `/products/variants/${variantId}`,
    { method: "DELETE" },
  );
}

export type LookupKind = "category" | "gender" | "productType" | "color" | "size";

export interface LookupUsage {
  id: string;
  kind: LookupKind;
  /** Number of products/variants still pointing at this value. */
  inUseBy: number;
  canDelete: boolean;
}

export function getLookupUsage(kind: LookupKind, id: string) {
  return apiFetch<LookupUsage>(`/catalog/${kind}/${id}/usage`);
}

export function updateLookup(
  kind: LookupKind,
  id: string,
  body: { name?: string; hexCode?: string; standard?: string; value?: string; sortOrder?: number },
) {
  return apiFetch<{ id: string }>(`/catalog/${kind}/${id}`, { method: "PATCH", body });
}

export function deleteLookup(kind: LookupKind, id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(`/catalog/${kind}/${id}`, { method: "DELETE" });
}
