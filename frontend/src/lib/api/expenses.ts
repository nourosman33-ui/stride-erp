import { apiFetch, getAuthToken } from "./client";
import type { PaymentMethodType } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export type DailyExpenseStatus = "pending" | "approved" | "rejected";
export type ExpenseQuickPeriod = "today" | "week" | "month" | "year";

export interface DailyExpenseCategory {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface DailyExpense {
  id: string;
  storeId: string;
  categoryId: string;
  description: string;
  amount: string;
  paymentMethod: PaymentMethodType;
  occurredAt: string;
  notes: string | null;
  status: DailyExpenseStatus;
  approvedById: string | null;
  approvedAt: string | null;
  rejectedById: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  receiptOriginalName: string | null;
  receiptStoredName: string | null;
  receiptMimeType: string | null;
  receiptSizeBytes: number | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  lastModifiedById: string | null;
  lastModifiedAt: string | null;
  deletedAt: string | null;
  deletedById: string | null;
  deletionReason: string | null;
  category: DailyExpenseCategory;
  createdBy: { id: string; fullName: string };
  approvedBy: { id: string; fullName: string } | null;
  rejectedBy: { id: string; fullName: string } | null;
  lastModifiedBy: { id: string; fullName: string } | null;
  deletedBy: { id: string; fullName: string } | null;
}

export interface PendingSummary {
  count: number;
  amount: number;
}

export interface ListExpensesResult {
  items: DailyExpense[];
  total: number;
  page: number;
  pageSize: number;
  pending: PendingSummary;
}

export interface ListExpensesFilters {
  storeId: string;
  period?: ExpenseQuickPeriod;
  from?: string;
  to?: string;
  categoryId?: string;
  paymentMethod?: PaymentMethodType;
  userId?: string;
  status?: DailyExpenseStatus;
  amountMin?: number;
  amountMax?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CategoryBreakdownEntry {
  categoryId: string;
  categoryName: string;
  amount: number;
  count: number;
}

export interface ExpenseWindowAnalytics {
  from: string;
  to: string;
  total: number;
  count: number;
  byCategory: CategoryBreakdownEntry[];
  byPaymentMethod: Record<PaymentMethodType, number>;
  averageDaily: number;
  highestDay: { date: string; amount: number } | null;
  highestCategory: CategoryBreakdownEntry | null;
}

export interface ExpenseQuickTotals {
  today: number;
  week: number;
  month: number;
  year: number;
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete" | "approve" | "reject";
  performedById: string;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  createdAt: string;
  performedBy: { id: string; fullName: string };
}

export interface CreateDailyExpenseInput {
  storeId: string;
  categoryId: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethodType;
  occurredAt?: string;
  notes?: string;
}

export type UpdateDailyExpenseInput = Partial<Omit<CreateDailyExpenseInput, "storeId">>;

export function listExpenses(filters: ListExpensesFilters) {
  return apiFetch<ListExpensesResult>("/expenses", {
    params: filters as unknown as Record<string, string | number | boolean | undefined>,
  });
}

export function getExpense(id: string) {
  return apiFetch<DailyExpense>(`/expenses/${id}`);
}

export function getExpenseHistory(id: string) {
  return apiFetch<AuditLogEntry[]>(`/expenses/${id}/history`);
}

export function listDeletedExpenses(storeId: string) {
  return apiFetch<DailyExpense[]>("/expenses/deleted", { params: { storeId } });
}

export function createExpense(input: CreateDailyExpenseInput) {
  return apiFetch<DailyExpense>("/expenses", { method: "POST", body: input });
}

export function updateExpense(id: string, input: UpdateDailyExpenseInput) {
  return apiFetch<DailyExpense>(`/expenses/${id}`, { method: "PATCH", body: input });
}

export function approveExpense(id: string) {
  return apiFetch<DailyExpense>(`/expenses/${id}/approve`, { method: "POST" });
}

export function rejectExpense(id: string, reason: string) {
  return apiFetch<DailyExpense>(`/expenses/${id}/reject`, { method: "POST", body: { reason } });
}

export function deleteExpense(id: string, reason?: string) {
  return apiFetch<DailyExpense>(`/expenses/${id}`, { method: "DELETE", body: { reason } });
}

export function getExpenseQuickTotals(storeId: string) {
  return apiFetch<ExpenseQuickTotals>("/expenses/analytics/quick-totals", { params: { storeId } });
}

export function getExpenseWindowAnalytics(storeId: string, period?: ExpenseQuickPeriod, from?: string, to?: string) {
  return apiFetch<ExpenseWindowAnalytics>("/expenses/analytics/window", {
    params: { storeId, period, from, to },
  });
}

export function listExpenseCategories() {
  return apiFetch<DailyExpenseCategory[]>("/catalog/expense-categories");
}

export function createExpenseCategory(name: string) {
  return apiFetch<DailyExpenseCategory>("/catalog/expense-categories", { method: "POST", body: { name } });
}

export function updateExpenseCategory(id: string, data: { name?: string; isActive?: boolean }) {
  return apiFetch<DailyExpenseCategory>(`/catalog/dailyExpenseCategory/${id}`, { method: "PATCH", body: data });
}

export function deleteExpenseCategory(id: string) {
  return apiFetch<{ id: string; kind: string; deleted: boolean }>(`/catalog/dailyExpenseCategory/${id}`, {
    method: "DELETE",
  });
}

// -------------------------------------------------------------------- receipt
//
// Multipart upload and binary download both bypass apiFetch (which assumes a
// JSON body/response), same as downloadWorkbook() does for .xlsx exports.

export async function uploadReceipt(expenseId: string, file: File): Promise<DailyExpense> {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE_URL}/expenses/${expenseId}/receipt`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((b) => b.message)
      .catch(() => `Upload failed (${res.status})`);
    throw new Error(Array.isArray(message) ? message.join(", ") : message);
  }
  return res.json();
}

export function deleteReceipt(expenseId: string) {
  return apiFetch<DailyExpense>(`/expenses/${expenseId}/receipt`, { method: "DELETE" });
}

/** Fetches the receipt with a real Authorization header (a bare <img src> can't
 * carry one) and hands back an object URL the caller must revoke when done. */
export async function fetchReceiptObjectUrl(expenseId: string): Promise<{ url: string; mimeType: string }> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/expenses/${expenseId}/receipt`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Could not load receipt (${res.status})`);
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), mimeType: blob.type };
}
