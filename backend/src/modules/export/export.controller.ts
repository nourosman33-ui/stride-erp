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
import { ExportPdfService } from "./export-pdf.service";
import { FeedsService } from "./feeds.service";
import { ListExpensesQueryDto } from "../expenses/dto/list-expenses-query.dto";

export class CreateFeedTokenDto {
  @IsUUID()
  storeId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIME = "text/csv; charset=utf-8";
const PDF_MIME = "application/pdf";

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
    private readonly exportsPdf: ExportPdfService,
    private readonly feeds: FeedsService,
    private readonly audit: AuditService,
  ) {}

  private send(res: Response, filename: string, buf: Buffer | string, mime: string = XLSX_MIME) {
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", Buffer.byteLength(buf));
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

  // ------------------------------------------------------- daily expenses

  @Get("expenses.xlsx")
  @Roles("owner", "manager")
  async expensesXlsx(@Query() query: ListExpensesQueryDto, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    this.send(res, `stride-expenses-${stamp()}.xlsx`, await this.exports.expensesWorkbook(query, user));
  }

  @Get("expenses.csv")
  @Roles("owner", "manager")
  async expensesCsv(@Query() query: ListExpensesQueryDto, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    this.send(res, `stride-expenses-${stamp()}.csv`, await this.exports.expensesCsv(query, user), CSV_MIME);
  }

  @Get("expenses.pdf")
  @Roles("owner", "manager")
  async expensesPdf(@Query() query: ListExpensesQueryDto, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    this.send(res, `stride-expenses-${stamp()}.pdf`, await this.exportsPdf.expenseListPdf(query, user), PDF_MIME);
  }

  // Cashier included to match the end-of-day brief they can already view and
  // print from /pos/end-day — same data, just as a file.
  @Get("daily-closing.pdf")
  @Roles("owner", "manager", "cashier")
  async dailyClosingPdf(@Query("storeId") storeId: string, @Query("date") date: string, @Res() res: Response) {
    this.send(res, `stride-daily-closing-${date}.pdf`, await this.exportsPdf.dailyClosingPdf(storeId, date), PDF_MIME);
  }

  // Monthly/yearly figures roll up the same margin-sensitive numbers as /finance —
  // owner only, matching that controller's posture.
  @Get("financial-report.pdf")
  @Roles("owner")
  async financialReportPdf(
    @Query("storeId") storeId: string,
    @Query("period") period: "monthly" | "yearly",
    @Query("key") key: string,
    @Res() res: Response,
  ) {
    const buf = await this.exportsPdf.financialReportPdf(storeId, period, key);
    this.send(res, `stride-financial-report-${key}.pdf`, buf, PDF_MIME);
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
