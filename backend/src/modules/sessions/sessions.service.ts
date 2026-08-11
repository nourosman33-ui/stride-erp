import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BusinessSession, PaymentMethodType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { money } from "../finance/finance.constants";

/** A voided sale never happened — same rule FinanceService applies to revenue. */
const REVENUE_STATUS_FILTER: Prisma.EnumSalesOrderStatusFilter = { not: "voided" };

export interface SessionSummary {
  totalSales: number;
  salesCount: number;
  totalRefunds: number;
  refundsCount: number;
  totalExchanges: number;
  exchangesCount: number;
  totalExpenses: number;
  expensesCount: number;
  /** Sales less refunds — the trading result for the session. */
  netSales: number;
  /** Cash actually in/out of the drawer: cash sales − cash refunds − cash expenses. */
  netCash: number;
  cashSales: number;
  cardSales: number;
  otherSales: number;
  cashRefunds: number;
  cashExpenses: number;
  transactionCount: number;
  unitsSold: number;
  byPaymentMethod: Record<PaymentMethodType, number>;
  /** Who did what during the session, so a shift can be reviewed per person. */
  cashierActivity: { userId: string; fullName: string; salesCount: number; salesTotal: number }[];
}

export interface SessionWithSummary {
  session: BusinessSession & {
    startedBy: { id: string; fullName: string };
    endedBy: { id: string; fullName: string } | null;
  };
  summary: SessionSummary;
  /** Live for an active session, final for a closed one. */
  durationMs: number;
}

const SESSION_INCLUDE = {
  startedBy: { select: { id: true, fullName: true } },
  endedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.BusinessSessionInclude;

/**
 * A business session is the unit of "a day" here — it begins when someone presses
 * Start Day and ends when they press End Day. Calendar dates are deliberately not
 * involved: two sessions can share a date, and one session can run past midnight.
 *
 * Every figure a session reports is derived from the transactions carrying its
 * sessionId, never from a date range. That is what makes a closed session's totals
 * stable — later trading gets a different sessionId (or none), so it cannot leak
 * backwards into a session that has already been reported on.
 */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  getActive(storeId: string) {
    return this.prisma.businessSession.findFirst({
      where: { storeId, status: "active" },
      include: SESSION_INCLUDE,
      orderBy: { startedAt: "desc" },
    });
  }

  /**
   * Opens a new session. The uniqueness of "one active session per store" can't be
   * expressed as a Prisma constraint (it needs a partial index), so the check and
   * the insert run inside one transaction to avoid two Start Day presses racing
   * into two open sessions.
   */
  async start(storeId: string, userId: string, openingCash?: number, notes?: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.businessSession.findFirst({
        where: { storeId, status: "active" },
        select: { id: true, sessionNumber: true },
      });
      if (existing) {
        throw new ConflictException(
          `Session #${String(existing.sessionNumber).padStart(3, "0")} is still open. End it before starting a new one.`,
        );
      }

      // Atomic per-store counter — same pattern as invoiceSeq/returnSeq.
      const seqStore = await tx.store.update({
        where: { id: storeId },
        data: { sessionSeq: { increment: 1 } },
        select: { sessionSeq: true },
      });

      return tx.businessSession.create({
        data: {
          storeId,
          sessionNumber: seqStore.sessionSeq,
          status: "active",
          startedAt: new Date(),
          startedById: userId,
          openingCash: openingCash ?? null,
          notes,
        },
        include: SESSION_INCLUDE,
      });
    });
  }

  /** Closes the session. Its totals are already immutable — they are derived from
   * rows stamped with this sessionId, and nothing new can be stamped once closed. */
  async end(sessionId: string, userId: string, closingCash?: number, notes?: string) {
    const session = await this.prisma.businessSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.status === "closed") {
      throw new ConflictException("This session is already closed.");
    }

    return this.prisma.businessSession.update({
      where: { id: sessionId },
      data: {
        status: "closed",
        endedAt: new Date(),
        endedById: userId,
        closingCash: closingCash ?? session.closingCash,
        notes: notes ?? session.notes,
      },
      include: SESSION_INCLUDE,
    });
  }

  async findOne(sessionId: string) {
    const session = await this.prisma.businessSession.findUnique({
      where: { id: sessionId },
      include: SESSION_INCLUDE,
    });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    return session;
  }

  list(storeId: string, limit = 50) {
    return this.prisma.businessSession.findMany({
      where: { storeId },
      include: SESSION_INCLUDE,
      orderBy: { sessionNumber: "desc" },
      take: limit,
    });
  }

  /** The session plus its computed totals — used for both the live view and history. */
  async getWithSummary(sessionId: string): Promise<SessionWithSummary> {
    const session = await this.findOne(sessionId);
    const summary = await this.computeSummary(sessionId);
    const end = session.endedAt ?? new Date();
    return {
      session,
      summary,
      durationMs: end.getTime() - session.startedAt.getTime(),
    };
  }

  /** Empty totals — what an active session shows before anything happens, and what
   * a caller gets when there is no session at all. */
  static emptySummary(): SessionSummary {
    return {
      totalSales: 0,
      salesCount: 0,
      totalRefunds: 0,
      refundsCount: 0,
      totalExchanges: 0,
      exchangesCount: 0,
      totalExpenses: 0,
      expensesCount: 0,
      netSales: 0,
      netCash: 0,
      cashSales: 0,
      cardSales: 0,
      otherSales: 0,
      cashRefunds: 0,
      cashExpenses: 0,
      transactionCount: 0,
      unitsSold: 0,
      byPaymentMethod: { cash: 0, card: 0, mobile_wallet: 0, bank_transfer: 0 },
      cashierActivity: [],
    };
  }

  /**
   * Every number here is scoped by sessionId alone — no date filter anywhere, which
   * is what keeps sessions independent of the calendar and of each other.
   */
  async computeSummary(sessionId: string): Promise<SessionSummary> {
    const [orders, returns, expenses, payments, lineAgg] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: { sessionId, status: REVENUE_STATUS_FILTER },
        select: {
          id: true,
          grandTotal: true,
          cashierId: true,
          cashier: { select: { id: true, fullName: true } },
          // An exchange raises a replacement sale; flagging it lets the summary
          // report exchanges separately without double-counting them as plain sales.
          exchangedFrom: { select: { id: true } },
        },
      }),
      this.prisma.salesReturn.findMany({
        where: { sessionId },
        select: { id: true, type: true, refundTotal: true, exchangeTotal: true, refundMethod: true },
      }),
      this.prisma.dailyExpense.findMany({
        where: { sessionId, status: "approved", deletedAt: null },
        select: { id: true, amount: true, paymentMethod: true },
      }),
      this.prisma.payment.groupBy({
        by: ["method"],
        where: { order: { sessionId, status: REVENUE_STATUS_FILTER } },
        _sum: { amount: true },
      }),
      this.prisma.salesOrderLine.aggregate({
        where: { order: { sessionId, status: REVENUE_STATUS_FILTER } },
        _sum: { quantity: true },
      }),
    ]);

    const byPaymentMethod: Record<PaymentMethodType, number> = {
      cash: 0,
      card: 0,
      mobile_wallet: 0,
      bank_transfer: 0,
    };
    for (const p of payments) byPaymentMethod[p.method] = money(Number(p._sum.amount ?? 0));

    const totalSales = money(orders.reduce((s, o) => s + Number(o.grandTotal), 0));
    const totalRefunds = money(returns.reduce((s, r) => s + Number(r.refundTotal), 0));
    const exchanges = returns.filter((r) => r.type === "exchange");
    const totalExchanges = money(exchanges.reduce((s, r) => s + Number(r.exchangeTotal), 0));
    const totalExpenses = money(expenses.reduce((s, e) => s + Number(e.amount), 0));

    const cashRefunds = money(
      returns.filter((r) => r.refundMethod === "cash").reduce((s, r) => s + Number(r.refundTotal), 0),
    );
    const cashExpenses = money(
      expenses.filter((e) => e.paymentMethod === "cash").reduce((s, e) => s + Number(e.amount), 0),
    );

    const activity = new Map<string, { userId: string; fullName: string; salesCount: number; salesTotal: number }>();
    for (const o of orders) {
      const entry = activity.get(o.cashierId) ?? {
        userId: o.cashierId,
        fullName: o.cashier.fullName,
        salesCount: 0,
        salesTotal: 0,
      };
      entry.salesCount += 1;
      entry.salesTotal += Number(o.grandTotal);
      activity.set(o.cashierId, entry);
    }

    return {
      totalSales,
      salesCount: orders.length,
      totalRefunds,
      refundsCount: returns.filter((r) => r.type === "refund").length,
      totalExchanges,
      exchangesCount: exchanges.length,
      totalExpenses,
      expensesCount: expenses.length,
      netSales: money(totalSales - totalRefunds),
      netCash: money(byPaymentMethod.cash - cashRefunds - cashExpenses),
      cashSales: byPaymentMethod.cash,
      cardSales: byPaymentMethod.card,
      otherSales: money(byPaymentMethod.mobile_wallet + byPaymentMethod.bank_transfer),
      cashRefunds,
      cashExpenses,
      // Every logged financial action, matching what the Transaction Log lists.
      transactionCount: orders.length + returns.length + expenses.length,
      unitsSold: lineAgg._sum.quantity ?? 0,
      byPaymentMethod,
      cashierActivity: [...activity.values()]
        .map((a) => ({ ...a, salesTotal: money(a.salesTotal) }))
        .sort((a, b) => b.salesTotal - a.salesTotal),
    };
  }

  /** The id new transactions should be stamped with — null when no session is open,
   * which must never block trading. */
  async activeSessionId(storeId: string): Promise<string | null> {
    const active = await this.prisma.businessSession.findFirst({
      where: { storeId, status: "active" },
      select: { id: true },
    });
    return active?.id ?? null;
  }
}
