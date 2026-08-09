// Mirrors backend/prisma/schema.prisma. Prisma Decimal fields are serialized
// by Nest as JSON strings (verified against the live API), so every money /
// percentage field here is typed `string` — use `toNumber()` from lib/utils
// before doing arithmetic or formatting.

export type Role = "owner" | "manager" | "cashier" | "inventory_clerk" | "accountant" | "viewer";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  roles: Role[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userRoles?: UserRole[];
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  storeId: string | null;
  role: { id: string; name: string };
  store?: { id: string; name: string } | null;
}

export interface Store {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  sizeSqm: string | null;
  frontageM: string | null;
  openingDate: string | null;
  concept: string | null;
  targetMarket: string | null;
  currency: string;
  vatRate: string;
  poApprovalThreshold: string;
  discountApprovalLimitPct: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  logoUrl: string | null;
  taxNumber: string | null;
  receiptFooterLine1: string | null;
  receiptFooterLine2: string | null;
  returnPeriodDays: number;
  loyaltyPointsPerCurrency: string;
  loyaltyPointValue: string;
  loyaltySilverThreshold: string;
  loyaltyGoldThreshold: string;
  loyaltyPlatinumThreshold: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Gender {
  id: string;
  name: string;
}

export interface ProductType {
  id: string;
  name: string;
}

export interface Color {
  id: string;
  name: string;
  hexCode: string | null;
}

export interface SizeValue {
  id: string;
  standard: string;
  value: string;
  sortOrder: number;
}

export interface Product {
  id: string;
  modelName: string;
  categoryId: string;
  genderId: string;
  productTypeId: string;
  brand: string | null;
  baseCostPrice: string;
  baseSellingPrice: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category?: Category;
  gender?: Gender;
  productType?: ProductType;
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: string;
  productId: string;
  sizeValueId: string;
  colorId: string;
  barcode: string;
  sku: string | null;
  costPriceOverride: string | null;
  sellingPriceOverride: string | null;
  reorderPoint: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  sizeValue?: SizeValue;
  color?: Color;
  product?: Product;
}

export type PriceField = "cost_price" | "selling_price";

export interface PriceHistoryEntry {
  id: string;
  productId: string;
  variantId: string | null;
  field: PriceField;
  oldValue: string | null;
  newValue: string;
  effectiveAt: string;
  changedById: string;
  reason: string | null;
  changedBy?: { id: string; fullName: string };
}

export interface Supplier {
  id: string;
  name: string;
  factoryName: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  socialContact: string | null;
  minimumOrder: string | null;
  paymentTerms: string | null;
  leadTimeDaysMin: number | null;
  leadTimeDaysMax: number | null;
  qualityRating: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSupplier {
  id: string;
  productId: string;
  supplierId: string;
  supplierCostPrice: string;
  piecesPerCarton: number | null;
  isPreferred: boolean;
  product?: Product;
}

export type SupplierLedgerType = "deposit" | "payment" | "credit_note";

export interface SupplierLedgerEntry {
  id: string;
  supplierId: string;
  purchaseOrderId: string | null;
  type: SupplierLedgerType;
  amount: string;
  balanceAfter: string;
  note: string | null;
  createdAt: string;
}

export type PoStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "partially_received"
  | "received"
  | "cancelled";

export interface PurchaseOrderLine {
  id: string;
  purchaseOrderId: string;
  variantId: string;
  quantityOrdered: number;
  cartons: number | null;
  piecesPerCarton: number | null;
  costPrice: string;
  sellingPriceAtOrder: string;
  lineTotal: string;
  expectedProfit: string;
  variant?: ProductVariant;
}

export interface PurchaseOrder {
  id: string;
  storeId: string;
  supplierId: string;
  status: PoStatus;
  orderDate: string;
  expectedDeliveryDate: string | null;
  approvedById: string | null;
  createdById: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  store?: Store;
  supplier?: Supplier;
  lines?: PurchaseOrderLine[];
  goodsReceipts?: GoodsReceipt[];
}

export type GoodsReceiptStatus = "full" | "partial" | "discrepancy";

export interface GoodsReceiptLine {
  id: string;
  goodsReceiptId: string;
  purchaseOrderLineId: string;
  quantityReceived: number;
  quantityExpected: number;
  discrepancyReason: string | null;
}

export interface GoodsReceipt {
  id: string;
  purchaseOrderId: string;
  receivedDate: string;
  receivedById: string;
  status: GoodsReceiptStatus;
  createdAt: string;
  lines?: GoodsReceiptLine[];
}

export interface PurchaseReturn {
  id: string;
  purchaseOrderId: string | null;
  variantId: string;
  quantity: number;
  reason: string;
  createdById: string;
  createdAt: string;
  variant?: ProductVariant;
  createdBy?: { id: string; fullName: string };
  purchaseOrder?: { id: string; supplier?: { name: string } } | null;
}

export type StockEntryType =
  | "receipt"
  | "sale"
  | "sale_return"
  | "adjustment"
  | "transfer_out"
  | "transfer_in"
  | "count_correction"
  | "purchase_return";

export interface StockLedgerEntry {
  id: string;
  storeId: string;
  variantId: string;
  entryType: StockEntryType;
  quantityDelta: number;
  unitCost: string | null;
  referenceType: string | null;
  referenceId: string | null;
  reasonCode: string | null;
  performedById: string;
  createdAt: string;
}

// Shape returned by GET /inventory/stock/:storeId and /inventory/reorder-alerts/:storeId
// (InventoryService.listStockOnHand / getReorderAlerts) — a flattened, already-joined
// row, not the raw StockLedgerEntry/ProductVariant models. These numeric fields are
// plain JS numbers computed server-side (not Prisma Decimal passthrough), so unlike
// most money fields elsewhere they arrive as JSON numbers, not strings.
export interface StockOnHandRow {
  variantId: string;
  productName?: string;
  size?: string;
  color?: string;
  barcode?: string;
  quantityOnHand: number;
  avgUnitCost: number | null;
  inventoryValue: number | null;
}

export interface TotalInventoryValue {
  storeId: string;
  totalInventoryValue: number;
}

export type MovementStatusLabel =
  | "No Stock Received"
  | "Fast Moving"
  | "Slow Moving"
  | "Dead Stock";

export interface MovementStatus {
  status: MovementStatusLabel;
  received: number;
  sold: number;
  soldRatio: number | null;
}

export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  birthDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Shape returned by GET /customers and GET /customers/phone/:phone — Customer plus
// derived (never stored) purchase stats, same numbers-not-strings convention as
// StockOnHandRow since these are computed server-side, not Prisma Decimal passthrough.
export interface CustomerWithStats extends Customer {
  totalOrders: number;
  lifetimeSpending: number;
  lastPurchaseAt: string | null;
  pointsBalance: number;
}

export type LoyaltyTransactionType = "earn" | "redeem" | "adjustment";

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  storeId: string;
  type: LoyaltyTransactionType;
  pointsDelta: number;
  referenceType: string | null;
  referenceId: string | null;
  performedById: string | null;
  note: string | null;
  createdAt: string;
}

// Shape returned by GET /customers/:id — stats + tier + recent orders/loyalty history.
export interface CustomerDetail extends CustomerWithStats {
  tier: LoyaltyTier;
  salesOrders?: SalesOrder[];
  loyaltyTransactions?: LoyaltyTransaction[];
}

export type SalesOrderStatus = "completed" | "partially_returned" | "returned" | "voided";

export type PaymentMethodType = "cash" | "card" | "mobile_wallet" | "bank_transfer";

export interface SalesOrderLine {
  id: string;
  orderId: string;
  variantId: string;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  netPrice: string;
  taxAmount: string;
  variant?: ProductVariant;
}

export interface Payment {
  id: string;
  orderId: string;
  method: PaymentMethodType;
  amount: string;
  referenceNo: string | null;
  createdAt: string;
}

export interface SalesOrder {
  id: string;
  storeId: string;
  invoiceNumber: string;
  customerId: string | null;
  cashierId: string;
  orderDate: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  pointsEarned: number;
  pointsRedeemed: number;
  amountTendered: string | null;
  changeDue: string;
  status: SalesOrderStatus;
  createdAt: string;
  store?: Store;
  customer?: Customer | null;
  cashier?: { id: string; fullName: string };
  lines?: SalesOrderLine[];
  payments?: Payment[];
  // Only present on the immediate checkout response — the customer's post-sale points
  // balance and tier, for the receipt. Not persisted on the order itself.
  loyaltySnapshot?: { pointsBalance: number; tier: LoyaltyTier } | null;
  // Any refunds/exchanges filed against this sale — each links to its own full receipt
  // at GET /returns/:id rather than duplicating that detail here.
  returns?: {
    id: string;
    returnNumber: string;
    returnDate: string;
    type: "refund" | "exchange";
    refundTotal: string;
    exchangeTotal: string;
    balanceDue: string;
    exchangeOrderId: string | null;
  }[];
}

export type AiMessageRole = "user" | "assistant" | "system";

export interface AiToolCallRecord {
  tool: string;
  input?: Record<string, unknown>;
  output: unknown;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: AiMessageRole;
  content: string;
  toolCalls: AiToolCallRecord[] | null;
  createdAt: string;
}

export interface AiConversation {
  id: string;
  ownerId: string;
  storeId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: AiMessage[];
}

export interface AiInsights {
  revenueToday: { revenue: number; orderCount: number };
  profitToday: { revenue: number; cogs: number; profit: number };
  unitsSoldToday: { unitsSold: number };
  topProducts: { variantId: string; productName: string; sizeLabel: string; colorName: string; unitsSold: number }[];
  lowStock: StockOnHandRow[];
  weekComparison: { thisWeekRevenue: number; lastWeekRevenue: number; changePct: number | null };
  recommendations: string[];
}
