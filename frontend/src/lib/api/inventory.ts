import { apiFetch } from "./client";
import type { MovementStatus, StockLedgerEntry, StockOnHandRow, TotalInventoryValue } from "./types";

export function listStockOnHand(storeId: string) {
  return apiFetch<StockOnHandRow[]>(`/inventory/stock/${storeId}`);
}

export function getStockOnHand(storeId: string, variantId: string) {
  return apiFetch<number>(`/inventory/stock/${storeId}/${variantId}`);
}

export function getMovementStatus(storeId: string, variantId: string) {
  return apiFetch<MovementStatus>(`/inventory/movement-status/${storeId}/${variantId}`);
}

export function getTotalInventoryValue(storeId: string) {
  return apiFetch<TotalInventoryValue>(`/inventory/value/${storeId}`);
}

export function getReorderAlerts(storeId: string) {
  return apiFetch<StockOnHandRow[]>(`/inventory/reorder-alerts/${storeId}`);
}

export interface CreateAdjustmentInput {
  storeId: string;
  variantId: string;
  quantityDelta: number;
  reasonCode: string;
}

export function createAdjustment(input: CreateAdjustmentInput) {
  return apiFetch<StockLedgerEntry>("/inventory/adjustments", { method: "POST", body: input });
}
