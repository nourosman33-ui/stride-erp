import { apiFetch } from "./client";
import type { Store } from "./types";

export interface CreateStoreInput {
  name: string;
  address?: string;
  phone?: string;
  sizeSqm?: number;
  frontageM?: number;
  openingDate?: string;
  concept?: string;
  targetMarket?: string;
  currency?: string;
  vatRate?: number;
  poApprovalThreshold?: number;
  discountApprovalLimitPct?: number;
  logoUrl?: string;
  taxNumber?: string;
  receiptFooterLine1?: string;
  receiptFooterLine2?: string;
  returnPeriodDays?: number;
  loyaltyPointsPerCurrency?: number;
  loyaltyPointValue?: number;
  loyaltySilverThreshold?: number;
  loyaltyGoldThreshold?: number;
  loyaltyPlatinumThreshold?: number;
}

export type UpdateStoreInput = Partial<CreateStoreInput>;

export function listStores() {
  return apiFetch<Store[]>("/stores");
}

export function getStore(id: string) {
  return apiFetch<Store>(`/stores/${id}`);
}

export function createStore(input: CreateStoreInput) {
  return apiFetch<Store>("/stores", { method: "POST", body: input });
}

export function updateStore(id: string, input: UpdateStoreInput) {
  return apiFetch<Store>(`/stores/${id}`, { method: "PATCH", body: input });
}
