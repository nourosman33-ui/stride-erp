import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { FinanceService } from "../finance/finance.service";
import { ForecastService } from "../finance/forecast.service";
import { InventoryService } from "../inventory/inventory.service";

/** 32 bytes of CSPRNG entropy, base64url — not guessable, safe in a URL path. */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

@Injectable()
export class FeedsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly forecast: ForecastService,
    private readonly inventory: InventoryService,
  ) {}

  listTokens(storeId: string) {
    return this.prisma.feedToken.findMany({
      where: { storeId },
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
      include: { createdBy: { select: { fullName: true } } },
    });
  }

  createToken(storeId: string, label: string, createdById: string) {
    return this.prisma.feedToken.create({
      data: { storeId, label, createdById, token: generateToken() },
    });
  }

  /** Revoke rather than delete, so a leaked link's usage history stays visible. */
  async revokeToken(id: string) {
    const found = await this.prisma.feedToken.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`Feed link ${id} not found`);
    return this.prisma.feedToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Resolves a URL token to its store. Records `lastUsedAt` so a revoked-too-late link
   * still shows whether anyone was pulling from it.
   */
  async resolveToken(token: string) {
    const row = await this.prisma.feedToken.findUnique({ where: { token } });
    if (!row || row.revokedAt) {
      // Same message either way — don't reveal whether a token ever existed.
      throw new UnauthorizedException("This feed link is not valid or has been revoked");
    }
    await this.prisma.feedToken.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });
    return row;
  }

  /**
   * Excel's Data → From Web parses HTML tables natively, which is far friendlier for a
   * non-technical user than JSON through Power Query. One <table> per feed, no styling
   * that Excel would have to strip.
   */
  private htmlTable(title: string, headers: string[], rows: (string | number | null)[][]): string {
    const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
    const body = rows
      .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body><h1>${escapeHtml(title)}</h1>
<table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<p>Generated ${new Date().toISOString()}</p></body></html>`;
  }

  async financialsFeed(storeId: string): Promise<string> {
    const o = await this.finance.getOverview(storeId);
    const rows = (
      [
        ["Today", o.periods.daily],
        ["This week", o.periods.weekly],
        ["This month", o.periods.monthly],
        ["Last 30 days", o.periods.last30Days],
        ["Since inception", o.periods.inceptionToDate],
      ] as const
    ).map(([label, p]) => [
      label,
      p.netRevenue,
      p.returnsNetValue,
      p.cogs,
      p.grossProfit,
      p.grossMarginPct,
      p.operatingExpenses,
      p.netProfit,
      p.netMarginPct,
      p.orderCount,
      p.unitsSold,
    ]);
    return this.htmlTable(
      `STRIDE Financials (${o.currency})`,
      [
        "Period", "Net revenue", "Returns", "COGS", "Gross profit", "Gross margin %",
        "Operating costs", "Net profit", "Net margin %", "Orders", "Units sold",
      ],
      rows,
    );
  }

  async forecastFeed(storeId: string, horizonMonths = 6): Promise<string> {
    const f = await this.forecast.getForecast(storeId, horizonMonths);
    return this.htmlTable(
      `STRIDE Forecast (${f.currency}) — ${f.basis.confidence} confidence, estimate only`,
      [
        "Month", "Projected net revenue", "Projected COGS", "Projected gross profit",
        "Projected operating costs", "Projected net profit", "Cumulative net profit",
        "Cumulative vs investment",
      ],
      f.months.map((m) => [
        m.label,
        m.projectedNetRevenue,
        m.projectedCogs,
        m.projectedGrossProfit,
        m.projectedOperatingCosts,
        m.projectedNetProfit,
        m.cumulativeNetProfit,
        m.cumulativeVsInvestment,
      ]),
    );
  }

  async salesFeed(storeId: string): Promise<string> {
    const orders = await this.prisma.salesOrder.findMany({
      where: { storeId },
      include: { customer: true, cashier: { select: { fullName: true } }, lines: true, payments: true },
      orderBy: { orderDate: "desc" },
      take: 1000,
    });
    return this.htmlTable(
      "STRIDE Sales",
      ["Invoice", "Date", "Customer", "Cashier", "Status", "Payment", "Subtotal", "Discount", "VAT", "Total", "Items"],
      orders.map((o) => [
        o.invoiceNumber,
        o.orderDate.toISOString().slice(0, 16).replace("T", " "),
        o.customer?.name ?? "Walk-in",
        o.cashier.fullName,
        o.status,
        o.payments.map((p) => p.method).join(", "),
        Number(o.subtotal),
        Number(o.discountTotal),
        Number(o.taxTotal),
        Number(o.grandTotal),
        o.lines.reduce((s, l) => s + l.quantity, 0),
      ]),
    );
  }

  async stockFeed(storeId: string): Promise<string> {
    const stock = await this.inventory.listStockOnHand(storeId);
    return this.htmlTable(
      "STRIDE Stock on hand",
      ["Product", "Size", "Colour", "Barcode", "Qty on hand", "Avg unit cost", "Inventory value"],
      stock.map((s) => [
        s.productName ?? s.variantId,
        s.size ?? "",
        s.color ?? "",
        s.barcode ?? "",
        s.quantityOnHand,
        s.avgUnitCost,
        s.inventoryValue,
      ]),
    );
  }
}
