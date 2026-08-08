import { apiFetch } from "./client";
import type { Customer, LoyaltyTier, PaymentMethodType, SalesOrderStatus } from "./types";

export type ReturnType = "refund" | "exchange";

/** GET /returns/eligibility/:orderId — what a cashier is still allowed to take back. */
export interface ReturnEligibilityLine {
  orderLineId: string;
  variantId: string;
  productName: string;
  brand: string | null;
  imageUrl: string | null;
  size: string;
  color: string;
  barcode: string;
  quantitySold: number;
  quantityReturned: number;
  quantityReturnable: number;
  unitPrice: string;
  discountAmount: string;
  refundPerUnit: number;
}

export interface ReturnEligibility {
  orderId: string;
  invoiceNumber: string;
  orderDate: string;
  status: SalesOrderStatus;
  currency: string;
  customer: Customer | null;
  grandTotal: string;
  daysSinceSale: number;
  returnPeriodDays: number;
  withinReturnWindow: boolean;
  isVoided: boolean;
  lines: ReturnEligibilityLine[];
}

export interface SalesReturnLine {
  id: string;
  orderLineId: string;
  variantId: string;
  quantity: number;
  unitPrice: string;
  refundAmount: string;
  taxAmount: string;
  restock: boolean;
  condition: string | null;
  variant?: {
    id: string;
    barcode: string;
    sku: string | null;
    product: { id: string; modelName: string; brand: string | null; imageUrl: string | null };
    sizeValue: { value: string; standard: string };
    color: { name: string };
  };
}

export interface SalesReturn {
  id: string;
  storeId: string;
  returnNumber: string;
  originalOrderId: string;
  customerId: string | null;
  returnDate: string;
  type: ReturnType;
  reason: string | null;
  refundSubtotal: string;
  refundTaxTotal: string;
  refundTotal: string;
  exchangeTotal: string;
  balanceDue: string;
  refundMethod: PaymentMethodType | null;
  pointsAdjusted: number;
  exchangeOrderId: string | null;
  lines?: SalesReturnLine[];
  originalOrder?: { id: string; invoiceNumber: string; orderDate: string; status: SalesOrderStatus };
  exchangeOrder?: { id: string; invoiceNumber: string; grandTotal: string } | null;
  customer?: Customer | null;
  processedBy?: { id: string; fullName: string };
  store?: { name: string; currency: string; address: string | null; phone: string | null };
  loyaltySnapshot?: { pointsBalance: number; tier: LoyaltyTier } | null;
}

export interface CreateReturnInput {
  originalOrderId: string;
  type: ReturnType;
  lines: { orderLineId: string; quantity: number; restock?: boolean; condition?: string }[];
  exchangeLines?: { variantId: string; quantity: number; discountAmount?: number }[];
  refundMethod?: PaymentMethodType;
  balancePaymentMethod?: PaymentMethodType;
  reason?: string;
  overrideReturnWindow?: boolean;
}

export function getReturnEligibility(orderId: string) {
  return apiFetch<ReturnEligibility>(`/returns/eligibility/${orderId}`);
}

export function createReturn(input: CreateReturnInput) {
  return apiFetch<SalesReturn>("/returns", { method: "POST", body: input });
}

export function listReturns(storeId?: string) {
  return apiFetch<SalesReturn[]>("/returns", { params: { storeId } });
}

export function getReturn(id: string) {
  return apiFetch<SalesReturn>(`/returns/${id}`);
}
