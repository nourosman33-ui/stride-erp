import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { PrismaService } from "../../prisma/prisma.service";
import { FinanceService } from "../finance/finance.service";
import { ForecastService } from "../finance/forecast.service";
import { InventoryService } from "../inventory/inventory.service";

/** Excel number formats. `#,##0.00` keeps thousands separators without forcing a locale symbol. */
const MONEY = "#,##0.00";
const INT = "#,##0";
const PCT = "0.0";

type Row = (string | number | null)[];

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly forecast: ForecastService,
    private readonly inventory: InventoryService,
  ) {}

  private newBook(): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator = "STRIDE ERP";
    wb.created = new Date();
    return wb;
  }

  /**
   * Header row + widths + per-column number formats, applied consistently so every sheet
   * opens looking like a report rather than a CSV dump.
   */
  private addSheet(
    wb: ExcelJS.Workbook,
    name: string,
    headers: string[],
    rows: Row[],
    formats: (string | null)[] = [],
    widths: number[] = [],
  ) {
    const ws = wb.addWorksheet(name);
    ws.addRow(headers);
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    header.alignment = { vertical: "middle" };

    for (const r of rows) ws.addRow(r);

    headers.forEach((h, i) => {
      const col = ws.getColumn(i + 1);
      col.width = widths[i] ?? Math.max(12, Math.min(38, h.length + 6));
      if (formats[i]) col.numFmt = formats[i]!;
    });

    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    return ws;
  }

  private async buffer(wb: ExcelJS.Workbook): Promise<Buffer> {
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** P&L across every period, the cost base, the daily series, and the forecast. */
  async financialsWorkbook(storeId: string, horizonMonths = 6): Promise<Buffer> {
    const [overview, forecast] = await Promise.all([
      this.finance.getOverview(storeId),
      this.forecast.getForecast(storeId, horizonMonths),
    ]);
    const wb = this.newBook();
    const cur = overview.currency;

    const periods = [
      ["Today", overview.periods.daily],
      ["This week", overview.periods.weekly],
      ["This month", overview.periods.monthly],
      ["Last 30 days", overview.periods.last30Days],
      ["Since inception", overview.periods.inceptionToDate],
    ] as const;

    this.addSheet(
      wb,
      "P&L",
      [
        "Period",
        `Gross revenue (incl. VAT, ${cur})`,
        `VAT collected (${cur})`,
        `Discounts (${cur})`,
        `Sales before returns (${cur})`,
        `Returns (${cur})`,
        `Net revenue (ex-VAT, ${cur})`,
        `COGS (${cur})`,
        `Gross profit (${cur})`,
        "Gross margin %",
        `Operating costs (${cur})`,
        `Net profit (${cur})`,
        "Net margin %",
        "Orders",
        "Units sold",
        `Average basket (${cur})`,
      ],
      periods.map(([label, p]) => [
        label,
        p.grossRevenue,
        p.vatCollected,
        p.discountsGiven,
        p.grossSalesNet,
        p.returnsNetValue,
        p.netRevenue,
        p.cogs,
        p.grossProfit,
        p.grossMarginPct,
        p.operatingExpenses,
        p.netProfit,
        p.netMarginPct,
        p.orderCount,
        p.unitsSold,
        p.averageBasket,
      ]),
      [null, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY, PCT, MONEY, MONEY, PCT, INT, INT, MONEY],
      [18],
    );

    this.addSheet(
      wb,
      "Cost base",
      ["Category", "Cost", `Amount (${cur})`, "Frequency", `Per month (${cur})`, "Status", "Starts", "Ends"],
      overview.costBase.expenses.map((e) => [
        e.category,
        e.label,
        Number(e.amount),
        e.frequency,
        // Same normalisation FinanceService uses, so this column ties to the KPI.
        e.frequency === "one_time"
          ? null
          : Number(
              (
                (Number(e.amount) /
                  { daily: 1, weekly: 7, monthly: 365.25 / 12, quarterly: 365.25 / 4, yearly: 365.25 }[
                    e.frequency
                  ]) *
                (365.25 / 12)
              ).toFixed(2),
            ),
        e.isActive ? "Active" : "Closed",
        e.startDate ? new Date(e.startDate).toISOString().slice(0, 10) : null,
        e.endDate ? new Date(e.endDate).toISOString().slice(0, 10) : null,
      ]),
      [null, null, MONEY, null, MONEY, null, null, null],
      [16, 34, 16, 12, 16, 10, 12, 12],
    );

    this.addSheet(
      wb,
      "Daily (30d)",
      ["Date", `Net revenue (${cur})`, `COGS (${cur})`, `Gross profit (${cur})`, `Operating costs (${cur})`, `Net profit (${cur})`],
      overview.series.map((d) => [
        d.date,
        d.netRevenue,
        d.cogs,
        d.grossProfit,
        d.operatingExpenses,
        d.netProfit,
      ]),
      [null, MONEY, MONEY, MONEY, MONEY, MONEY],
      [12],
    );

    this.addSheet(
      wb,
      "Forecast",
      [
        "Month",
        `Projected net revenue (${cur})`,
        `Projected COGS (${cur})`,
        `Projected gross profit (${cur})`,
        `Projected operating costs (${cur})`,
        `Projected net profit (${cur})`,
        `Cumulative net profit (${cur})`,
        `Cumulative vs investment (${cur})`,
      ],
      forecast.months.map((m) => [
        m.label,
        m.projectedNetRevenue,
        m.projectedCogs,
        m.projectedGrossProfit,
        m.projectedOperatingCosts,
        m.projectedNetProfit,
        m.cumulativeNetProfit,
        m.cumulativeVsInvestment,
      ]),
      [null, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY],
      [16],
    );

    // Assumptions sheet: a forecast without its basis stated is a number pretending to
    // be a fact. Anyone opening the workbook can see exactly what it assumed.
    this.addSheet(
      wb,
      "Assumptions",
      ["Item", "Value"],
      [
        ["Generated", new Date().toISOString().slice(0, 16).replace("T", " ")],
        ["Currency", cur],
        ["Lookback window (days)", forecast.basis.lookbackDays],
        ["Days with trading data", forecast.basis.daysWithData],
        ["Average daily net revenue", forecast.basis.averageDailyNetRevenue],
        ["Daily trend (change per day)", forecast.basis.dailyTrend],
        ["Trend applied", forecast.basis.trendApplied ? "Yes" : "No (too little history)"],
        ["Gross margin % used", forecast.basis.grossMarginPct],
        ["Monthly fixed costs", forecast.basis.monthlyFixedCosts],
        ["Break-even revenue / month", overview.planning.breakEvenMonthlyRevenue],
        ["Initial investment", overview.planning.initialInvestment],
        ["Cumulative net profit to date", overview.planning.cumulativeNetProfit],
        ["Projected payback month", forecast.summary.paybackMonth ?? "Not within horizon"],
        ["Confidence", forecast.basis.confidence],
        ["Note", forecast.basis.note],
        [
          "Caveat",
          "Arithmetic extrapolation of recent trading. Excludes seasonality, promotions, competition and one-off events. Not a guarantee.",
        ],
      ],
      [null, null],
      [32, 90],
    );

    return this.buffer(wb);
  }

  async salesWorkbook(storeId: string): Promise<Buffer> {
    const orders = await this.prisma.salesOrder.findMany({
      where: { storeId },
      include: {
        customer: true,
        cashier: { select: { fullName: true } },
        lines: { include: { variant: { include: { product: true, sizeValue: true, color: true } } } },
        payments: true,
      },
      orderBy: { orderDate: "desc" },
    });
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const cur = store.currency;
    const wb = this.newBook();

    this.addSheet(
      wb,
      "Sales",
      [
        "Invoice", "Date", "Customer", "Phone", "Cashier", "Status", "Payment",
        `Subtotal (${cur})`, `Discount (${cur})`, `VAT (${cur})`, `Total (${cur})`,
        "Points earned", "Points redeemed", "Items",
      ],
      orders.map((o) => [
        o.invoiceNumber,
        o.orderDate.toISOString().slice(0, 16).replace("T", " "),
        o.customer?.name ?? "Walk-in",
        o.customer?.phone ?? null,
        o.cashier.fullName,
        o.status,
        o.payments.map((p) => p.method).join(", "),
        Number(o.subtotal),
        Number(o.discountTotal),
        Number(o.taxTotal),
        Number(o.grandTotal),
        o.pointsEarned,
        o.pointsRedeemed,
        o.lines.reduce((s, l) => s + l.quantity, 0),
      ]),
      [null, null, null, null, null, null, null, MONEY, MONEY, MONEY, MONEY, INT, INT, INT],
      [22, 18, 22, 14, 18, 18, 16],
    );

    // Line-level sheet so a pivot table can slice by product, size or colour.
    this.addSheet(
      wb,
      "Sale lines",
      [
        "Invoice", "Date", "Product", "Brand", "Size", "Colour", "Barcode",
        "Qty", `Unit price (${cur})`, `Discount (${cur})`, `Net (${cur})`, `VAT (${cur})`,
      ],
      orders.flatMap((o) =>
        o.lines.map((l) => [
          o.invoiceNumber,
          o.orderDate.toISOString().slice(0, 10),
          l.variant.product.modelName,
          l.variant.product.brand,
          l.variant.sizeValue.value,
          l.variant.color.name,
          l.variant.barcode,
          l.quantity,
          Number(l.unitPrice),
          Number(l.discountAmount),
          Number(l.netPrice),
          Number(l.taxAmount),
        ]),
      ),
      [null, null, null, null, null, null, null, INT, MONEY, MONEY, MONEY, MONEY],
      [22, 12, 28, 14, 8, 12, 16],
    );

    const returns = await this.prisma.salesReturn.findMany({
      where: { storeId },
      include: { originalOrder: { select: { invoiceNumber: true } }, customer: true, processedBy: { select: { fullName: true } } },
      orderBy: { returnDate: "desc" },
    });

    this.addSheet(
      wb,
      "Returns",
      [
        "Return", "Date", "Original invoice", "Type", "Customer", "Processed by",
        `Refunded (${cur})`, `Exchange value (${cur})`, `Balance (${cur})`, "Points adjusted", "Reason",
      ],
      returns.map((r) => [
        r.returnNumber,
        r.returnDate.toISOString().slice(0, 16).replace("T", " "),
        r.originalOrder.invoiceNumber,
        r.type,
        r.customer?.name ?? "Walk-in",
        r.processedBy.fullName,
        Number(r.refundTotal),
        Number(r.exchangeTotal),
        Number(r.balanceDue),
        r.pointsAdjusted,
        r.reason,
      ]),
      [null, null, null, null, null, null, MONEY, MONEY, MONEY, INT, null],
      [22, 18, 22, 12, 20, 18],
    );

    return this.buffer(wb);
  }

  async stockWorkbook(storeId: string): Promise<Buffer> {
    const [stock, store] = await Promise.all([
      this.inventory.listStockOnHand(storeId),
      this.prisma.store.findUniqueOrThrow({ where: { id: storeId } }),
    ]);
    const cur = store.currency;
    const wb = this.newBook();

    this.addSheet(
      wb,
      "Stock on hand",
      ["Product", "Size", "Colour", "Barcode", "Qty on hand", `Avg unit cost (${cur})`, `Inventory value (${cur})`],
      stock.map((s) => [
        s.productName ?? s.variantId,
        s.size ?? null,
        s.color ?? null,
        s.barcode ?? null,
        s.quantityOnHand,
        s.avgUnitCost,
        s.inventoryValue,
      ]),
      [null, null, null, null, INT, MONEY, MONEY],
      [30, 8, 14, 16, 14, 18, 20],
    );

    return this.buffer(wb);
  }
}
