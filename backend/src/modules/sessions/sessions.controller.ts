import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { AuthenticatedUser, CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuditService } from "../../common/audit/audit.service";
import { SessionsService } from "./sessions.service";
import { TransactionLogService, type TransactionType } from "./transaction-log.service";
import { StartSessionDto } from "./dto/start-session.dto";
import { EndSessionDto } from "./dto/end-session.dto";

/**
 * Opening and closing the trading day is front-counter work, so cashiers are
 * included throughout. Sessions expose takings and cash position only — no cost,
 * margin or capital data, which stay behind FinanceController's owner-only guard.
 */
@Controller("sessions")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("owner", "manager", "cashier")
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly log: TransactionLogService,
    private readonly audit: AuditService,
  ) {}

  /** The active session and its live totals, or an explicit "none" — never an
   * implicit session conjured from today's date. */
  @Get("active")
  async getActive(@Query("storeId") storeId: string) {
    const active = await this.sessions.getActive(storeId);
    if (!active) {
      return { session: null, summary: SessionsService.emptySummary(), durationMs: 0 };
    }
    return this.sessions.getWithSummary(active.id);
  }

  @Get("history")
  history(@Query("storeId") storeId: string, @Query("limit") limit?: string) {
    return this.sessions.list(storeId, Number(limit) || 50);
  }

  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.sessions.getWithSummary(id);
  }

  @Post("start")
  async start(@Body() dto: StartSessionDto, @CurrentUser() user: AuthenticatedUser) {
    const session = await this.sessions.start(dto.storeId, user.userId, dto.openingCash, dto.notes);
    await this.audit.record({
      entityType: "business_session",
      entityId: session.id,
      action: "create",
      performedById: user.userId,
      after: { sessionNumber: session.sessionNumber, openingCash: dto.openingCash ?? null },
    });
    return session;
  }

  @Post(":id/end")
  async end(
    @Param("id") id: string,
    @Body() dto: EndSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const session = await this.sessions.end(id, user.userId, dto.closingCash, dto.notes);
    await this.audit.record({
      entityType: "business_session",
      entityId: id,
      action: "update",
      performedById: user.userId,
      before: { status: "active" },
      after: { status: "closed", closingCash: dto.closingCash ?? null, endedAt: session.endedAt },
    });
    return session;
  }
}

/** Unified log of every financial action, assembled from the existing sale,
 * return and expense records — see TransactionLogService for why it is a
 * projection rather than a table. */
@Controller("transaction-log")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("owner", "manager", "cashier")
export class TransactionLogController {
  constructor(private readonly log: TransactionLogService) {}

  @Get()
  list(
    @Query("storeId") storeId: string,
    @Query("sessionId") sessionId?: string,
    @Query("type") type?: TransactionType,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("userId") userId?: string,
    @Query("search") search?: string,
    @Query("limit") limit?: string,
  ) {
    return this.log.list({
      storeId,
      sessionId,
      type,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      userId,
      search,
      limit: Number(limit) || 200,
    });
  }

  @Get("totals")
  totals(
    @Query("storeId") storeId: string,
    @Query("sessionId") sessionId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.log.totals({
      storeId,
      sessionId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}
