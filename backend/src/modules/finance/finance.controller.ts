import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { AuditService } from "../../common/audit/audit.service";
import { FinanceService } from "./finance.service";
import { ForecastService } from "./forecast.service";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";

/**
 * Owner-only. Cost base, margins and capital position are the most sensitive data in the
 * system — enforced here by the guard, not by hiding the nav link.
 */
@Controller("finance")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("owner")
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly forecast: ForecastService,
    private readonly audit: AuditService,
  ) {}

  /** Forward projection of revenue and net profit — an estimate, see ForecastService. */
  @Get("forecast")
  getForecast(
    @Query("storeId") storeId: string,
    @Query("horizonMonths") horizonMonths?: string,
  ) {
    return this.forecast.getForecast(storeId, Number(horizonMonths) || 6);
  }

  @Get("overview")
  getOverview(@Query("storeId") storeId: string) {
    return this.finance.getOverview(storeId);
  }

  /** Ad-hoc P&L for an arbitrary window (defaults to the last 30 days). */
  @Get("pnl")
  getPnl(
    @Query("storeId") storeId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.finance.getPnl(storeId, fromDate, toDate);
  }

  @Get("expenses")
  listExpenses(@Query("storeId") storeId: string) {
    return this.finance.listExpenses(storeId);
  }

  @Post("expenses")
  async createExpense(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    const created = await this.finance.createExpense({
      storeId: dto.storeId,
      category: dto.category,
      label: dto.label,
      amount: dto.amount,
      frequency: dto.frequency,
      startDate: new Date(dto.startDate),
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      isActive: dto.isActive ?? true,
      notes: dto.notes,
      createdById: user.userId,
    });
    await this.audit.record({
      entityType: "operating_expense",
      entityId: created.id,
      action: "create",
      performedById: user.userId,
      after: { label: dto.label, amount: dto.amount, frequency: dto.frequency },
    });
    return created;
  }

  @Patch("expenses/:id")
  async updateExpense(
    @Param("id") id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const updated = await this.finance.updateExpense(id, {
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });
    await this.audit.record({
      entityType: "operating_expense",
      entityId: id,
      action: "update",
      performedById: user.userId,
      after: { ...dto },
    });
    return updated;
  }

  /** Closes the cost rather than deleting it, so past periods keep reporting it. */
  @Delete("expenses/:id")
  async closeExpense(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const closed = await this.finance.closeExpense(id, new Date());
    await this.audit.record({
      entityType: "operating_expense",
      entityId: id,
      action: "update",
      performedById: user.userId,
      after: { isActive: false, closedAt: new Date().toISOString() },
    });
    return closed;
  }
}
