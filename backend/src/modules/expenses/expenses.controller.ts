import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { AuditService } from "../../common/audit/audit.service";
import { ExpensesService } from "./expenses.service";
import { ExpenseAnalyticsService } from "./expense-analytics.service";
import { ReceiptStorageService, RECEIPT_MULTER_OPTIONS } from "./receipt-storage.service";
import { CreateDailyExpenseDto } from "./dto/create-daily-expense.dto";
import { UpdateDailyExpenseDto } from "./dto/update-daily-expense.dto";
import { ExpenseQuickPeriod, ListExpensesQueryDto } from "./dto/list-expenses-query.dto";
import { RejectDailyExpenseDto } from "./dto/reject-daily-expense.dto";
import { DeleteDailyExpenseDto } from "./dto/delete-daily-expense.dto";
import { resolveWindow } from "./period-windows";

@Controller("expenses")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly analytics: ExpenseAnalyticsService,
    private readonly audit: AuditService,
    private readonly receiptStorage: ReceiptStorageService,
  ) {}

  // Static routes before ":id" so they aren't swallowed as an id param.

  @Get("deleted")
  @Roles("owner")
  listDeleted(@Query("storeId") storeId: string) {
    return this.expenses.listDeleted(storeId);
  }

  /** {today, week, month, year} for the KPI strip — store-wide for manager/owner,
   * the cashier's own contribution for cashier. */
  @Get("analytics/quick-totals")
  @Roles("owner", "manager", "cashier")
  quickTotals(@Query("storeId") storeId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.analytics.getQuickTotals(storeId, this.analytics.scopeFor(user));
  }

  /** Breakdown/averages/highest-day/highest-category for an arbitrary window.
   * Cashier is clamped to today + their own rows, same as the list endpoint. */
  @Get("analytics/window")
  @Roles("owner", "manager", "cashier")
  windowAnalytics(
    @Query("storeId") storeId: string,
    @Query("period") period: ExpenseQuickPeriod | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = this.analytics.scopeFor(user);
    const resolved = scope ? resolveWindow({ period: "today" }) : resolveWindow({ period, from, to });
    return this.analytics.getWindowAnalytics(storeId, resolved.from, resolved.to, scope);
  }

  @Get()
  @Roles("owner", "manager", "cashier")
  list(@Query() query: ListExpensesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.list(query, user);
  }

  @Get(":id")
  @Roles("owner", "manager", "cashier")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.findOne(id, user);
  }

  @Get(":id/history")
  @Roles("owner", "manager")
  history(@Param("id") id: string) {
    return this.expenses.getHistory(id);
  }

  @Post()
  @Roles("owner", "manager", "cashier")
  async create(@Body() dto: CreateDailyExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    const created = await this.expenses.create(dto, user);
    await this.audit.record({
      entityType: "daily_expense",
      entityId: created.id,
      action: "create",
      performedById: user.userId,
      after: {
        description: dto.description,
        amount: dto.amount,
        categoryId: dto.categoryId,
        paymentMethod: dto.paymentMethod,
        status: created.status,
      },
    });
    return created;
  }

  @Patch(":id")
  @Roles("owner", "manager")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateDailyExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const before = await this.expenses.findOne(id, user);
    const updated = await this.expenses.update(id, dto, user);
    await this.audit.record({
      entityType: "daily_expense",
      entityId: id,
      action: "update",
      performedById: user.userId,
      before: {
        description: before.description,
        amount: before.amount.toString(),
        categoryId: before.categoryId,
        paymentMethod: before.paymentMethod,
      },
      after: { ...dto },
    });
    return updated;
  }

  @Post(":id/approve")
  @Roles("owner", "manager")
  async approve(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const approved = await this.expenses.approve(id, user);
    await this.audit.record({
      entityType: "daily_expense",
      entityId: id,
      action: "approve",
      performedById: user.userId,
      before: { status: "pending" },
      after: { status: "approved" },
    });
    return approved;
  }

  @Post(":id/reject")
  @Roles("owner", "manager")
  async reject(
    @Param("id") id: string,
    @Body() dto: RejectDailyExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rejected = await this.expenses.reject(id, dto.reason, user);
    await this.audit.record({
      entityType: "daily_expense",
      entityId: id,
      action: "reject",
      performedById: user.userId,
      before: { status: "pending" },
      after: { status: "rejected", rejectionReason: dto.reason },
    });
    return rejected;
  }

  // Owner only — requirement #8: Manager's permissions never include delete, only
  // "edit/correct"; Owner explicitly gets "edit/delete".
  @Delete(":id")
  @Roles("owner")
  async remove(
    @Param("id") id: string,
    @Body() dto: DeleteDailyExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const deleted = await this.expenses.softDelete(id, dto.reason, user);
    await this.audit.record({
      entityType: "daily_expense",
      entityId: id,
      action: "delete",
      performedById: user.userId,
      before: {
        description: deleted.description,
        amount: deleted.amount.toString(),
        status: deleted.status,
      },
      after: { deletedAt: deleted.deletedAt, deletionReason: dto.reason },
    });
    return deleted;
  }

  // ---------------------------------------------------------------- receipt

  @Post(":id/receipt")
  @Roles("owner", "manager", "cashier")
  @UseInterceptors(FileInterceptor("file", RECEIPT_MULTER_OPTIONS))
  async uploadReceipt(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    const updated = await this.expenses.attachReceipt(
      id,
      { originalname: file.originalname, filename: file.filename, mimetype: file.mimetype, size: file.size },
      user,
    );
    await this.audit.record({
      entityType: "daily_expense",
      entityId: id,
      action: "update",
      performedById: user.userId,
      after: { receiptUploaded: true, receiptOriginalName: file.originalname },
    });
    return updated;
  }

  /** JWT-authenticated — receipts are financial records, never served as
   * unauthenticated static files. The JWT strategy only reads the Authorization
   * header (never a query param), so the frontend fetches this with a real
   * Authorization header and renders the result via an object URL — a bare
   * `<img src>` cannot carry the token. */
  @Get(":id/receipt")
  @Roles("owner", "manager", "cashier")
  async getReceipt(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const expense = await this.expenses.getReceiptInfo(id, user);
    if (!expense.receiptStoredName || !this.receiptStorage.exists(expense.receiptStoredName)) {
      throw new NotFoundException("No receipt attached to this expense");
    }
    res.setHeader("Content-Type", expense.receiptMimeType ?? "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(expense.receiptOriginalName ?? "receipt")}"`,
    );
    res.sendFile(this.receiptStorage.filePath(expense.receiptStoredName));
  }

  @Delete(":id/receipt")
  @Roles("owner", "manager")
  async deleteReceipt(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const before = await this.expenses.getReceiptInfo(id, user);
    const storedName = before.receiptStoredName;
    const updated = await this.expenses.removeReceipt(id, user);
    if (storedName) this.receiptStorage.delete(storedName);
    await this.audit.record({
      entityType: "daily_expense",
      entityId: id,
      action: "update",
      performedById: user.userId,
      after: { receiptRemoved: true },
    });
    return updated;
  }
}
