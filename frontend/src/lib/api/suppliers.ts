import { apiFetch } from "./client";
import type { ProductSupplier, Supplier, SupplierLedgerEntry, SupplierLedgerType } from "./types";

export interface CreateSupplierInput {
  name: string;
  factoryName?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  socialContact?: string;
  minimumOrder?: string;
  paymentTerms?: string;
  leadTimeDaysMin?: number;
  leadTimeDaysMax?: number;
  qualityRating?: number;
  notes?: string;
}

export function listSuppliers() {
  return apiFetch<Supplier[]>("/suppliers");
}

export function getSupplier(id: string) {
  return apiFetch<Supplier>(`/suppliers/${id}`);
}

export function createSupplier(input: CreateSupplierInput) {
  return apiFetch<Supplier>("/suppliers", { method: "POST", body: input });
}

export interface LinkProductInput {
  productId: string;
  supplierCostPrice: number;
  piecesPerCarton?: number;
  isPreferred?: boolean;
}

export function linkProduct(supplierId: string, input: LinkProductInput) {
  return apiFetch<ProductSupplier>(`/suppliers/${supplierId}/products`, {
    method: "POST",
    body: input,
  });
}

export function listLinkedProducts(supplierId: string) {
  return apiFetch<ProductSupplier[]>(`/suppliers/${supplierId}/products`);
}

export interface RecordPaymentInput {
  type: SupplierLedgerType;
  amount: number;
  purchaseOrderId?: string;
  note?: string;
}

export function recordPayment(supplierId: string, input: RecordPaymentInput) {
  return apiFetch<SupplierLedgerEntry>(`/suppliers/${supplierId}/payments`, {
    method: "POST",
    body: input,
  });
}

export function getLedger(supplierId: string) {
  return apiFetch<SupplierLedgerEntry[]>(`/suppliers/${supplierId}/ledger`);
}
