import { Body, Controller, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { AuditService } from "../../common/audit/audit.service";
import { CashFlowService } from "./cash-flow.service";
import { SetCashAmountDto } from "./dto/set-cash-amount.dto";

/**
 * Cashiers are included because closing the till at end of day is front-counter
 * work — they physically count the drawer. What they can reach is only their own
 * store's cash position (opening/counted/expected); margin, cost and profit data
 * stays behind FinanceController's owner-only guard.
 */
@Controller("cash-counts")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("owner", "manager", "cashier")
export class CashCountsController {
  constructor(
    private readonly cashFlow: CashFlowService,
    private readonly audit: AuditService,
  ) {}

  @Get(":date")
  getForDate(@Param("date") date: string, @Query("storeId") storeId: string) {
    return this.cashFlow.computeCashFlow(storeId, new Date(date));
  }

  @Get()
  listHistory(@Query("storeId") storeId: string, @Query("from") from: string, @Query("to") to: string) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    return this.cashFlow.listHistory(storeId, new Date(from), toDate);
  }

  @Put(":date/opening")
  async setOpening(
    @Param("date") date: string,
    @Body() dto: SetCashAmountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.cashFlow.setOpeningCash(dto.storeId, new Date(date), dto.amount, user.userId);
    await this.audit.record({
      entityType: "cash_count",
      entityId: result.id,
      action: "update",
      performedById: user.userId,
      after: { date, openingCash: dto.amount },
    });
    return result;
  }

  @Put(":date/count")
  async recordCount(
    @Param("date") date: string,
    @Body() dto: SetCashAmountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.cashFlow.recordActualClosing(dto.storeId, new Date(date), dto.amount, user.userId);
    await this.audit.record({
      entityType: "cash_count",
      entityId: result.id,
      action: "update",
      performedById: user.userId,
      after: { date, actualClosingCash: dto.amount, countedById: user.userId },
    });
    return result;
  }
}
