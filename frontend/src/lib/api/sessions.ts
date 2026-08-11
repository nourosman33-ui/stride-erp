import { apiFetch } from "./client";
import type { PaymentMethodType } from "./types";

export type SessionStatus = "active" | "closed";
export type TransactionType = "sale" | "refund" | "exchange" | "expense";

export interface BusinessSession {
  id: string;
  storeId: string;
  sessionNumber: number;
  status: SessionStatus;
  startedAt: string;
  startedById: string;
  endedAt: string | null;
  endedById: string | null;
  openingCash: string | null;
  closingCash: string | null;
  notes: string | null;
  startedBy: { id: string; fullName: string };
  endedBy: { id: string; fullName: string } | null;
}

export interface SessionSummary {
  totalSales: number;
  salesCount: number;
  totalRefunds: number;
  refundsCount: number;
  totalExchanges: number;
  exchangesCount: number;
  totalExpenses: number;
  expensesCount: number;
  netSales: number;
  netCash: number;
  cashSales: number;
  cardSales: number;
  otherSales: number;
  cashRefunds: number;
  cashExpenses: number;
  transactionCount: number;
  unitsSold: number;
  byPaymentMethod: Record<PaymentMethodType, number>;
  cashierActivity: { userId: string; fullName: string; salesCount: number; salesTotal: number }[];
}

export interface SessionWithSummary {
  session: BusinessSession | null;
  summary: SessionSummary;
  durationMs: number;
}

export interface TransactionLogEntry {
  transactionId: string;
  reference: string;
  type: TransactionType;
  occurredAt: string;
  sessionId: string | null;
  sessionNumber: number | null;
  storeId: string;
  customerId: string | null;
  customerName: string | null;
  userId: string;
  userName: string;
  relatedReference: string | null;
  relatedId: string | null;
  itemSummary: string | null;
  quantity: number | null;
  originalAmount: number;
  refundAmount: number | null;
  exchangeAmount: number | null;
  netAmount: number;
  paymentMethod: PaymentMethodType | null;
  notes: string | null;
  status: string;
}

export interface TransactionLogTotals {
  count: number;
  sales: number;
  refunds: number;
  exchanges: number;
  expenses: number;
  net: number;
}

/** The open session and its live totals, or `session: null` when none is open. */
export function getActiveSession(storeId: string) {
  return apiFetch<SessionWithSummary>("/sessions/active", { params: { storeId } });
}

export function getSession(id: string) {
  return apiFetch<SessionWithSummary>(`/sessions/${id}`);
}

export function listSessions(storeId: string, limit = 50) {
  return apiFetch<BusinessSession[]>("/sessions/history", { params: { storeId, limit } });
}

export function startSession(storeId: string, openingCash?: number, notes?: string) {
  return apiFetch<BusinessSession>("/sessions/start", {
    method: "POST",
    body: { storeId, openingCash, notes },
  });
}

export function endSession(id: string, closingCash?: number, notes?: string) {
  return apiFetch<BusinessSession>(`/sessions/${id}/end`, {
    method: "POST",
    body: { closingCash, notes },
  });
}

export interface TransactionLogFilters {
  storeId: string;
  sessionId?: string;
  type?: TransactionType;
  from?: string;
  to?: string;
  userId?: string;
  search?: string;
  limit?: number;
}

export function listTransactionLog(filters: TransactionLogFilters) {
  return apiFetch<TransactionLogEntry[]>("/transaction-log", {
    params: filters as unknown as Record<string, string | number | boolean | undefined>,
  });
}

export function getTransactionLogTotals(filters: {
  storeId: string;
  sessionId?: string;
  from?: string;
  to?: string;
}) {
  return apiFetch<TransactionLogTotals>("/transaction-log/totals", {
    params: filters as unknown as Record<string, string | number | boolean | undefined>,
  });
}

/** "2h 34m" — sessions are routinely long, so hours+minutes is the useful precision. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
