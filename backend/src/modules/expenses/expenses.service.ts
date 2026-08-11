import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { money } from "../finance/finance.constants";
import { dayWindow, resolveWindow } from "./period-windows";
import { isElevated } from "./role-utils";
import { SessionsService } from "../sessions/sessions.service";
import { CreateDailyExpenseDto } from "./dto/create-daily-expense.dto";
import { UpdateDailyExpenseDto } from "./dto/update-daily-expense.dto";
import { ListExpensesQueryDto } from "./dto/list-expenses-query.dto";

const EXPENSE_INCLUDE = {
  category: true,
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  rejectedBy: { select: { id: true, fullName: true } },
  lastModifiedBy: { select: { id: true, fullName: true } },
  deletedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.DailyExpenseInclude;

/**
 * Ad-hoc daily cash-out expenses (water, cleaning supplies, transport, ...).
 * Deliberately separate from FinanceService's OperatingExpense (recurring
 * fixed costs) — see the schema comment on DailyExpense for why.
 *
 * Approval: cashier-created rows start "pending" and stay invisible to every
 * total until a manager/owner approves them; manager/owner-created rows
 * auto-approve immediately. Cashier reads are scoped server-side to their
 * own rows for today only, regardless of what filters the client sends —
 * RolesGuard only checks role *names*, not row ownership, so that scoping
 * has to happen here.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  async list(query: ListExpensesQueryDto, requester: AuthenticatedUser) {
    const elevated = isElevated(requester.roles);
    const window = resolveWindow(query);

    const where: Prisma.DailyExpenseWhereInput = {
      storeId: query.storeId,
      deletedAt: null,
      occurredAt: { gte: window.from, lt: window.to },
    };

    if (!elevated) {
      // Cashier: forced to their own rows regardless of any userId filter sent.
      where.createdById = requester.userId;
    } else if (query.userId) {
      where.createdById = query.userId;
    }
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
    if (query.status) where.status = query.status;
    if (query.amountMin !== undefined || query.amountMax !== undefined) {
      where.amount = {
        ...(query.amountMin !== undefined ? { gte: query.amountMin } : {}),
        ...(query.amountMax !== undefined ? { lte: query.amountMax } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { description: { contains: query.search, mode: "insensitive" } },
        { notes: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const [items, total, pending] = await Promise.all([
      this.prisma.dailyExpense.findMany({
        where,
        include: EXPENSE_INCLUDE,
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.dailyExpense.count({ where }),
      this.getPendingSummary(query.storeId, elevated ? undefined : requester.userId),
    ]);

    return { items, total, page, pageSize, pending };
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const expense = await this.prisma.dailyExpense.findFirst({
      where: { id, deletedAt: null },
      include: EXPENSE_INCLUDE,
    });
    if (!expense || !this.visibleToCashier(expense, requester)) {
      // 404 either way — a cashier probing another id shouldn't learn it exists.
      throw new NotFoundException(`Expense ${id} not found`);
    }
    return expense;
  }

  private visibleToCashier(
    expense: { createdById: string; occurredAt: Date },
    requester: AuthenticatedUser,
  ): boolean {
    if (isElevated(requester.roles)) return true;
    const today = dayWindow();
    return (
      expense.createdById === requester.userId &&
      expense.occurredAt >= today.from &&
      expense.occurredAt < today.to
    );
  }

  async create(dto: CreateDailyExpenseDto, requester: AuthenticatedUser) {
    const elevated = isElevated(requester.roles);
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    // Null when no session is open — recording a spend is never blocked on that.
    const sessionId = await this.sessions.activeSessionId(dto.storeId);

    return this.prisma.dailyExpense.create({
      data: {
        storeId: dto.storeId,
        sessionId,
        categoryId: dto.categoryId,
        description: dto.description,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        occurredAt,
        notes: dto.notes,
        createdById: requester.userId,
        // Status resolved server-side from the requester's role — never
        // client-supplied — so a cashier can't self-approve by sending status.
        status: elevated ? "approved" : "pending",
        ...(elevated ? { approvedById: requester.userId, approvedAt: new Date() } : {}),
      },
      include: EXPENSE_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateDailyExpenseDto, requester: AuthenticatedUser) {
    const existing = await this.requireActive(id);
    if (existing.status === "rejected") {
      throw new ConflictException(
        "This expense was rejected and can no longer be edited. Delete it and add a corrected one instead.",
      );
    }
    return this.prisma.dailyExpense.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        description: dto.description,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        notes: dto.notes,
        lastModifiedById: requester.userId,
        lastModifiedAt: new Date(),
      },
      include: EXPENSE_INCLUDE,
    });
  }

  async approve(id: string, requester: AuthenticatedUser) {
    const existing = await this.requireActive(id);
    if (existing.status !== "pending") {
      throw new ConflictException(`This expense is already ${existing.status}, not pending.`);
    }
    return this.prisma.dailyExpense.update({
      where: { id },
      data: { status: "approved", approvedById: requester.userId, approvedAt: new Date() },
      include: EXPENSE_INCLUDE,
    });
  }

  async reject(id: string, reason: string, requester: AuthenticatedUser) {
    const existing = await this.requireActive(id);
    if (existing.status !== "pending") {
      throw new ConflictException(`This expense is already ${existing.status}, not pending.`);
    }
    return this.prisma.dailyExpense.update({
      where: { id },
      data: {
        status: "rejected",
        rejectedById: requester.userId,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
      include: EXPENSE_INCLUDE,
    });
  }

  /** Soft delete only — the row stays in the DB forever, just excluded from every
   * active read path. `deletedAt`/`deletedById`/`deletionReason` are the audit trail. */
  async softDelete(id: string, reason: string | undefined, requester: AuthenticatedUser) {
    await this.requireActive(id);
    return this.prisma.dailyExpense.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: requester.userId, deletionReason: reason },
      include: EXPENSE_INCLUDE,
    });
  }

  listDeleted(storeId: string) {
    return this.prisma.dailyExpense.findMany({
      where: { storeId, deletedAt: { not: null } },
      include: EXPENSE_INCLUDE,
      orderBy: { deletedAt: "desc" },
    });
  }

  getHistory(id: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType: "daily_expense", entityId: id },
      include: { performedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** {count, amount} of not-yet-reviewed expenses — threaded into the list response,
   * the Cash Flow card and the Daily Closing Summary so an apparent cash mismatch
   * can be immediately explained by "N pending expenses not yet reflected" rather
   * than looking like a real discrepancy. */
  async getPendingSummary(storeId: string, createdById?: string, paymentMethod?: Prisma.DailyExpenseWhereInput["paymentMethod"]) {
    const where: Prisma.DailyExpenseWhereInput = { storeId, status: "pending", deletedAt: null };
    if (createdById) where.createdById = createdById;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    const agg = await this.prisma.dailyExpense.aggregate({
      where,
      _count: true,
      _sum: { amount: true },
    });
    return { count: agg._count, amount: money(Number(agg._sum.amount ?? 0)) };
  }

  private async requireActive(id: string) {
    const found = await this.prisma.dailyExpense.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException(`Expense ${id} not found`);
    return found;
  }

  /** `findOne` already enforces the cashier own+today visibility check, so routing
   * receipt access through it means a cashier can only attach/view/remove receipts
   * on rows they're allowed to see at all — no separate scoping logic needed here. */
  async attachReceipt(
    id: string,
    file: { originalname: string; filename: string; mimetype: string; size: number },
    requester: AuthenticatedUser,
  ) {
    const expense = await this.findOne(id, requester);
    return this.prisma.dailyExpense.update({
      where: { id: expense.id },
      data: {
        receiptOriginalName: file.originalname,
        receiptStoredName: file.filename,
        receiptMimeType: file.mimetype,
        receiptSizeBytes: file.size,
      },
      include: EXPENSE_INCLUDE,
    });
  }

  async getReceiptInfo(id: string, requester: AuthenticatedUser) {
    return this.findOne(id, requester);
  }

  async removeReceipt(id: string, requester: AuthenticatedUser) {
    const expense = await this.findOne(id, requester);
    return this.prisma.dailyExpense.update({
      where: { id: expense.id },
      data: {
        receiptOriginalName: null,
        receiptStoredName: null,
        receiptMimeType: null,
        receiptSizeBytes: null,
      },
      include: EXPENSE_INCLUDE,
    });
  }
}
