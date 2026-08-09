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

export interface RevalueStockInput {
  storeId: string;
  variantId: string;
  newUnitCost: number;
  reason?: string;
}

export interface RevalueStockResult {
  variantId: string;
  quantityOnHand: number;
  previousUnitCost: number | null;
  newUnitCost: number;
  inventoryValue: number;
}

/**
 * Corrects the cost of stock already on hand. Editing a product's price only affects
 * future receipts — stock already booked keeps the cost stamped on its ledger entry,
 * so this is the only way to fix stock that was added before the price was set.
 */
export function revalueStock(input: RevalueStockInput) {
  return apiFetch<RevalueStockResult>("/inventory/revalue", { method: "POST", body: input });
}
