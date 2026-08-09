import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { AuditService } from "../../common/audit/audit.service";
import { ExportService } from "./export.service";
import { FeedsService } from "./feeds.service";

export class CreateFeedTokenDto {
  @IsUUID()
  storeId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Authenticated .xlsx downloads and management of the token-authenticated live feeds.
 * The feeds themselves live in FeedsController (no JWT — Excel cannot send one).
 */
@Controller("export")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExportController {
  constructor(
    private readonly exports: ExportService,
    private readonly feeds: FeedsService,
    private readonly audit: AuditService,
  ) {}

  private send(res: Response, filename: string, buf: Buffer) {
    res.setHeader("Content-Type", XLSX_MIME);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buf.length);
    res.end(buf);
  }

  // Financials carry margin and cost data — owner only, matching FinanceController.
  @Get("financials.xlsx")
  @Roles("owner")
  async financials(
    @Query("storeId") storeId: string,
    @Query("horizonMonths") horizonMonths: string | undefined,
    @Res() res: Response,
  ) {
    const buf = await this.exports.financialsWorkbook(storeId, Number(horizonMonths) || 6);
    this.send(res, `stride-financials-${stamp()}.xlsx`, buf);
  }

  @Get("sales.xlsx")
  @Roles("owner", "manager", "accountant")
  async sales(@Query("storeId") storeId: string, @Res() res: Response) {
    this.send(res, `stride-sales-${stamp()}.xlsx`, await this.exports.salesWorkbook(storeId));
  }

  // Exposes cost and inventory value — never cashier-reachable.
  @Get("stock.xlsx")
  @Roles("owner", "manager", "inventory_clerk", "accountant")
  async stock(@Query("storeId") storeId: string, @Res() res: Response) {
    this.send(res, `stride-stock-${stamp()}.xlsx`, await this.exports.stockWorkbook(storeId));
  }

  // ----------------------------------------------------------- feed links

  @Get("feed-tokens")
  @Roles("owner")
  listTokens(@Query("storeId") storeId: string) {
    return this.feeds.listTokens(storeId);
  }

  @Post("feed-tokens")
  @Roles("owner")
  async createToken(@Body() dto: CreateFeedTokenDto, @CurrentUser() user: AuthenticatedUser) {
    const created = await this.feeds.createToken(dto.storeId, dto.label, user.userId);
    await this.audit.record({
      entityType: "feed_token",
      entityId: created.id,
      action: "create",
      performedById: user.userId,
      after: { label: dto.label, storeId: dto.storeId },
    });
    return created;
  }

  @Delete("feed-tokens/:id")
  @Roles("owner")
  async revokeToken(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const revoked = await this.feeds.revokeToken(id);
    await this.audit.record({
      entityType: "feed_token",
      entityId: id,
      action: "update",
      performedById: user.userId,
      after: { revokedAt: revoked.revokedAt },
    });
    return revoked;
  }
}
