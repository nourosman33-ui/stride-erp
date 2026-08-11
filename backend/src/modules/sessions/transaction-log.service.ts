import { Injectable } from "@nestjs/common";
import { PaymentMethodType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { money } from "../finance/finance.constants";

export type TransactionType = "sale" | "refund" | "exchange" | "expense";

export interface TransactionLogEntry {
  /** The source row's own id — stable, and what you'd open to see the document. */
  transactionId: string;
  /** Human-facing reference: invoice number, return number, or expense description. */
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
  /** The document this one acts on — the original invoice for a refund/exchange. */
  relatedReference: string | null;
  relatedId: string | null;
  itemSummary: string | null;
  quantity: number | null;
  /** Gross value of the original document. */
  originalAmount: number;
  refundAmount: number | null;
  exchangeAmount: number | null;
  /** Signed effect on the business: sales positive, refunds and expenses negative. */
  netAmount: number;
  paymentMethod: PaymentMethodType | null;
  notes: string | null;
  status: string;
}

export interface TransactionLogFilters {
  storeId: string;
  sessionId?: string;
  type?: TransactionType;
  from?: Date;
  to?: Date;
  userId?: string;
  search?: string;
  limit?: number;
}

/**
 * One chronological log of every financial action — sales, refunds, exchanges and
 * expenses — assembled at read time from the tables that already own those records.
 *
 * Deliberately a projection, not a table of its own: a second copy of each
 * transaction would be a second source of truth, free to drift from the first the
 * moment a write path forgot to update it. Reading through means the log can never
 * disagree with the sale, return or expense it describes.
 */
@Injectable()
export class TransactionLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: TransactionLogFilters): Promise<TransactionLogEntry[]> {
    const { storeId, sessionId, type, from, to, userId, search } = filters;
    const limit = filters.limit ?? 200;

    // A session filter must win over any date window: a session is defined by its
    // id, not by when it happened.
    const dateWindow = from || to ? { gte: from, lt: to } : undefined;
    const wantsType = (t: TransactionType) => !type || type === t;

    const [orders, returns, expenses] = await Promise.all([
      wantsType("sale")
        ? this.prisma.salesOrder.findMany({
            where: {
              storeId,
              ...(sessionId ? { sessionId } : {}),
              ...(dateWindow && !sessionId ? { orderDate: dateWindow } : {}),
              ...(userId ? { cashierId: userId } : {}),
              ...(search ? { invoiceNumber: { contains: search, mode: "insensitive" } } : {}),
            },
            select: {
              id: true,
              invoiceNumber: true,
              orderDate: true,
              sessionId: true,
              session: { select: { sessionNumber: true } },
              storeId: true,
              grandTotal: true,
              status: true,
              customer: { select: { id: true, name: true } },
              cashier: { select: { id: true, fullName: true } },
              payments: { select: { method: true } },
              lines: {
                select: { quantity: true, variant: { select: { product: { select: { modelName: true } } } } },
              },
              // Present when this sale is the replacement leg of an exchange.
              exchangedFrom: { select: { id: true, returnNumber: true } },
            },
            orderBy: { orderDate: "desc" },
            take: limit,
          })
        : [],
      wantsType("refund") || wantsType("exchange")
        ? this.prisma.salesReturn.findMany({
            where: {
              storeId,
              ...(sessionId ? { sessionId } : {}),
              ...(dateWindow && !sessionId ? { returnDate: dateWindow } : {}),
              ...(userId ? { processedById: userId } : {}),
              ...(type === "refund" ? { type: "refund" } : {}),
              ...(type === "exchange" ? { type: "exchange" } : {}),
              ...(search ? { returnNumber: { contains: search, mode: "insensitive" } } : {}),
            },
            select: {
              id: true,
              returnNumber: true,
              returnDate: true,
              sessionId: true,
              session: { select: { sessionNumber: true } },
              storeId: true,
              type: true,
              refundTotal: true,
              exchangeTotal: true,
              refundMethod: true,
              reason: true,
              customer: { select: { id: true, name: true } },
              processedBy: { select: { id: true, fullName: true } },
              originalOrder: { select: { id: true, invoiceNumber: true, grandTotal: true } },
              lines: {
                select: { quantity: true, variant: { select: { product: { select: { modelName: true } } } } },
              },
            },
            orderBy: { returnDate: "desc" },
            take: limit,
          })
        : [],
      wantsType("expense")
        ? this.prisma.dailyExpense.findMany({
            where: {
              storeId,
              deletedAt: null,
              ...(sessionId ? { sessionId } : {}),
              ...(dateWindow && !sessionId ? { occurredAt: dateWindow } : {}),
              ...(userId ? { createdById: userId } : {}),
              ...(search ? { description: { contains: search, mode: "insensitive" } } : {}),
            },
            select: {
              id: true,
              description: true,
              occurredAt: true,
              sessionId: true,
              session: { select: { sessionNumber: true } },
              storeId: true,
              amount: true,
              paymentMethod: true,
              notes: true,
              status: true,
              category: { select: { name: true } },
              createdBy: { select: { id: true, fullName: true } },
            },
            orderBy: { occurredAt: "desc" },
            take: limit,
          })
        : [],
    ]);

    const itemsOf = (lines: { quantity: number; variant: { product: { modelName: string } } }[]) => {
      if (lines.length === 0) return { summary: null, quantity: null };
      const names = lines.map((l) => `${l.variant.product.modelName} ×${l.quantity}`);
      const quantity = lines.reduce((s, l) => s + l.quantity, 0);
      return {
        summary: names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", "),
        quantity,
      };
    };

    const entries: TransactionLogEntry[] = [];

    for (const o of orders) {
      const items = itemsOf(o.lines);
      entries.push({
        transactionId: o.id,
        reference: o.invoiceNumber,
        type: "sale",
        occurredAt: o.orderDate.toISOString(),
        sessionId: o.sessionId,
        sessionNumber: o.session?.sessionNumber ?? null,
        storeId: o.storeId,
        customerId: o.customer?.id ?? null,
        customerName: o.customer?.name ?? null,
        userId: o.cashier.id,
        userName: o.cashier.fullName,
        // A replacement sale points back at the return that produced it.
        relatedReference: o.exchangedFrom?.returnNumber ?? null,
        relatedId: o.exchangedFrom?.id ?? null,
        itemSummary: items.summary,
        quantity: items.quantity,
        originalAmount: money(Number(o.grandTotal)),
        refundAmount: null,
        exchangeAmount: null,
        netAmount: o.status === "voided" ? 0 : money(Number(o.grandTotal)),
        paymentMethod: o.payments[0]?.method ?? null,
        notes: null,
        status: o.status,
      });
    }

    for (const r of returns) {
      const items = itemsOf(r.lines);
      const isExchange = r.type === "exchange";
      entries.push({
        transactionId: r.id,
        reference: r.returnNumber,
        type: isExchange ? "exchange" : "refund",
        occurredAt: r.returnDate.toISOString(),
        sessionId: r.sessionId,
        sessionNumber: r.session?.sessionNumber ?? null,
        storeId: r.storeId,
        customerId: r.customer?.id ?? null,
        customerName: r.customer?.name ?? null,
        userId: r.processedBy.id,
        userName: r.processedBy.fullName,
        relatedReference: r.originalOrder.invoiceNumber,
        relatedId: r.originalOrder.id,
        itemSummary: items.summary,
        quantity: items.quantity,
        originalAmount: money(Number(r.originalOrder.grandTotal)),
        refundAmount: money(Number(r.refundTotal)),
        exchangeAmount: isExchange ? money(Number(r.exchangeTotal)) : null,
        // Money leaving the business, so negative — the replacement sale of an
        // exchange is logged separately as its own positive sale row.
        netAmount: money(-Number(r.refundTotal)),
        paymentMethod: r.refundMethod,
        notes: r.reason,
        status: isExchange ? "exchange" : "refund",
      });
    }

    for (const e of expenses) {
      entries.push({
        transactionId: e.id,
        reference: e.description,
        type: "expense",
        occurredAt: e.occurredAt.toISOString(),
        sessionId: e.sessionId,
        sessionNumber: e.session?.sessionNumber ?? null,
        storeId: e.storeId,
        customerId: null,
        customerName: null,
        userId: e.createdBy.id,
        userName: e.createdBy.fullName,
        relatedReference: e.category.name,
        relatedId: null,
        itemSummary: e.category.name,
        quantity: null,
        originalAmount: money(Number(e.amount)),
        refundAmount: null,
        exchangeAmount: null,
        // Pending/rejected expenses are listed for visibility but must not move the
        // net figure — only approved spending counts, matching every other total.
        netAmount: e.status === "approved" ? money(-Number(e.amount)) : 0,
        paymentMethod: e.paymentMethod,
        notes: e.notes,
        status: e.status,
      });
    }

    return entries
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))
      .slice(0, limit);
  }

  /** Totals over a filtered log — used to prove the log reconciles with the session. */
  async totals(filters: TransactionLogFilters) {
    const entries = await this.list({ ...filters, limit: 100000 });
    const sum = (t: TransactionType, pick: (e: TransactionLogEntry) => number) =>
      money(entries.filter((e) => e.type === t).reduce((s, e) => s + pick(e), 0));

    return {
      count: entries.length,
      sales: sum("sale", (e) => e.originalAmount),
      refunds: sum("refund", (e) => e.refundAmount ?? 0) + sum("exchange", (e) => e.refundAmount ?? 0),
      exchanges: sum("exchange", (e) => e.exchangeAmount ?? 0),
      expenses: sum("expense", (e) => e.originalAmount),
      net: money(entries.reduce((s, e) => s + e.netAmount, 0)),
    };
  }
}
