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
