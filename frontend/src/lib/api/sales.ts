import { apiFetch } from "./client";
import type { PaymentMethodType, SalesOrder } from "./types";

export interface CheckoutLineInput {
  variantId: string;
  quantity: number;
  discountAmount?: number;
}

export interface CheckoutPaymentInput {
  method: PaymentMethodType;
  amount: number;
  referenceNo?: string;
}

export interface NewCustomerInput {
  name: string;
  phone?: string;
}

export interface CheckoutInput {
  storeId: string;
  customerId?: string;
  newCustomer?: NewCustomerInput;
  lines: CheckoutLineInput[];
  payments: CheckoutPaymentInput[];
  redeemPoints?: number;
  amountTendered?: number;
}

export function checkout(input: CheckoutInput) {
  return apiFetch<SalesOrder>("/sales/checkout", { method: "POST", body: input });
}

export function listSales(storeId?: string) {
  return apiFetch<SalesOrder[]>("/sales", { params: { storeId } });
}

export function getSale(id: string) {
  return apiFetch<SalesOrder>(`/sales/${id}`);
}

/** Cost-free sellable-items view for the POS UI — never exposes cost, see SalesService.getPosCatalog. */
export interface PosCatalogItem {
  variantId: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  categoryId: string;
  categoryName: string;
  barcode: string;
  sizeLabel: string;
  colorName: string;
  sellingPrice: number;
  quantityOnHand: number;
}

export function getPosCatalog(storeId: string) {
  return apiFetch<PosCatalogItem[]>("/sales/pos-catalog", { params: { storeId } });
}
