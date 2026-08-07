import { apiFetch } from "./client";
import type { Customer, CustomerDetail, CustomerWithStats } from "./types";

export interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  gender?: string;
  birthDate?: string;
  notes?: string;
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

export function listCustomers(search?: string) {
  return apiFetch<CustomerWithStats[]>("/customers", { params: { search } });
}

export function getCustomerByPhone(phone: string) {
  return apiFetch<CustomerWithStats | null>(`/customers/phone/${encodeURIComponent(phone)}`);
}

export function getCustomer(id: string, storeId?: string) {
  return apiFetch<CustomerDetail>(`/customers/${id}`, { params: { storeId } });
}

export function createCustomer(input: CreateCustomerInput) {
  return apiFetch<Customer>("/customers", { method: "POST", body: input });
}

export function updateCustomer(id: string, input: UpdateCustomerInput) {
  return apiFetch<Customer>(`/customers/${id}`, { method: "PATCH", body: input });
}

export interface AdjustLoyaltyInput {
  storeId: string;
  pointsDelta: number;
  note?: string;
}

export function adjustLoyalty(customerId: string, input: AdjustLoyaltyInput) {
  return apiFetch(`/customers/${customerId}/loyalty/adjust`, { method: "POST", body: input });
}
