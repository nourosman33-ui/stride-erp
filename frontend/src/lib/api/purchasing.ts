import { apiFetch } from "./client";
import type { GoodsReceipt, PurchaseOrder, PurchaseReturn } from "./types";

export interface CreatePurchaseOrderLineInput {
  variantId: string;
  quantityOrdered: number;
  cartons?: number;
  piecesPerCarton?: number;
  costPrice: number;
  sellingPriceAtOrder: number;
}

export interface CreatePurchaseOrderInput {
  storeId: string;
  supplierId: string;
  expectedDeliveryDate?: string;
  notes?: string;
  lines: CreatePurchaseOrderLineInput[];
}

export function listPurchaseOrders(storeId?: string) {
  return apiFetch<PurchaseOrder[]>("/purchase-orders", { params: { storeId } });
}

export function getPurchaseOrder(id: string) {
  return apiFetch<PurchaseOrder>(`/purchase-orders/${id}`);
}

export function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  return apiFetch<PurchaseOrder>("/purchase-orders", { method: "POST", body: input });
}

export function approvePurchaseOrder(id: string) {
  return apiFetch<PurchaseOrder>(`/purchase-orders/${id}/approve`, { method: "POST" });
}

export interface ReceiveGoodsLineInput {
  purchaseOrderLineId: string;
  quantityReceived: number;
  discrepancyReason?: string;
}

export function receiveGoods(id: string, lines: ReceiveGoodsLineInput[]) {
  return apiFetch<GoodsReceipt>(`/purchase-orders/${id}/receive`, {
    method: "POST",
    body: { lines },
  });
}

export interface CreatePurchaseReturnInput {
  storeId: string;
  variantId: string;
  purchaseOrderId?: string;
  quantity: number;
  reason: string;
}

export function createPurchaseReturn(input: CreatePurchaseReturnInput) {
  return apiFetch<PurchaseReturn>("/purchase-returns", { method: "POST", body: input });
}

export function listPurchaseReturns(storeId?: string) {
  return apiFetch<PurchaseReturn[]>("/purchase-returns", { params: { storeId } });
}

/** Refused once goods have been received — cancel the order instead. */
export function deletePurchaseOrder(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(`/purchase-orders/${id}`, { method: "DELETE" });
}

/** Posts a compensating receipt so the stock comes back, then removes the return. */
export function reversePurchaseReturn(id: string, storeId: string) {
  return apiFetch<{ id: string; reversed: boolean; quantityRestored: number }>(
    `/purchase-returns/${id}`,
    { method: "DELETE", params: { storeId } },
  );
}
