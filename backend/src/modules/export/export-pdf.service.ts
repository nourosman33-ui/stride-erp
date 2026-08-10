import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { ExpensesService } from "../expenses/expenses.service";
import { FinancialDashboardService } from "../expenses/financial-dashboard.service";
import { ListExpensesQueryDto } from "../expenses/dto/list-expenses-query.dto";

/**
 * PDF reports via pdfkit's imperative drawing API rather than a headless-browser
 * HTML-to-PDF pipeline — this runs as a small always-on local instance (see
 * scripts/start-erp.ps1), so avoiding a bundled Chromium download matters here.
 * Kept as its own class rather than folded into ExportService: pdfkit's
 * coordinate-based API is different enough from ExcelJS's declarative workbook
 * API that sharing a class would mostly be two unrelated toolkits side by side.
 */
@Injectable()
export class ExportPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expenses: ExpensesService,
    private readonly dashboard: FinancialDashboardService,
  ) {}

  private toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.end();
    });
  }

  private newDoc(title: string, storeName: string): PDFKit.PDFDocument {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.fontSize(18).text(title, { align: "left" });
    doc.fontSize(10).fillColor("#666").text(storeName);
    doc
      .fontSize(9)
      .text(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")}`)
      .fillColor("#000");
    doc.moveDown(1);
    return doc;
  }

  private money(amount: number, currency: string): string {
    return `${currency} ${amount.toFixed(2)}`;
  }

  private tableRow(doc: PDFKit.PDFDocument, cells: string[], widths: number[], opts: { bold?: boolean } = {}) {
    const startX = doc.x;
    const startY = doc.y;
    doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    let x = startX;
    cells.forEach((cell, i) => {
      doc.text(cell, x, startY, { width: widths[i], ellipsis: true });
      x += widths[i];
    });
    doc.y = startY + 16;
    doc.x = startX;
  }

  async expenseListPdf(query: ListExpensesQueryDto, requester: AuthenticatedUser): Promise<Buffer> {
    const [store, { items }] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({ where: { id: query.storeId } }),
      this.expenses.list({ ...query, pageSize: 100000 }, requester),
    ]);

    const doc = this.newDoc("Expense List", store.name);
    const widths = [70, 80, 150, 70, 70, 90];
    this.tableRow(doc, ["Date", "Category", "Description", "Amount", "Payment", "Status"], widths, { bold: true });
    doc.moveTo(doc.x, doc.y).lineTo(doc.x + widths.reduce((a, b) => a + b, 0), doc.y).stroke();
    doc.moveDown(0.3);

    let total = 0;
    for (const e of items) {
      total += Number(e.amount);
      this.tableRow(
        doc,
        [
          e.occurredAt.toISOString().slice(0, 10),
          e.category.name,
          e.description,
          this.money(Number(e.amount), store.currency),
          e.paymentMethod,
          e.status,
        ],
        widths,
      );
      if (doc.y > 760) doc.addPage();
    }

    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(11).text(`Total: ${this.money(total, store.currency)}`);

    return this.toBuffer(doc);
  }

  async dailyClosingPdf(storeId: string, date: string): Promise<Buffer> {
    const [store, closing] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({ where: { id: storeId } }),
      this.dashboard.getDailyClosing(storeId, new Date(date)),
    ]);
    const cur = store.currency;
    const doc = this.newDoc(`Daily Closing Summary — ${closing.date}`, store.name);

    const lines: [string, string][] = [
      ["Total sales", this.money(closing.totalSales, cur)],
      ["Cash sales", this.money(closing.cashSales, cur)],
      ["Card sales", this.money(closing.cardSales, cur)],
      ["Other payments", this.money(closing.otherPaymentSales, cur)],
      ["Total expenses", this.money(closing.totalExpenses, cur)],
      ["Cash expenses", this.money(closing.cashExpenses, cur)],
      ["Net income", this.money(closing.netIncome, cur)],
      ["Transactions", String(closing.transactionCount)],
      ["Expected closing cash", this.money(closing.expectedClosingCash, cur)],
      [
        "Actual closing cash",
        closing.actualClosingCash === null ? "Not counted" : this.money(closing.actualClosingCash, cur),
      ],
      [
        "Cash difference",
        closing.cashDifference === null ? "—" : `${this.money(closing.cashDifference, cur)} (${closing.cashStatus})`,
      ],
    ];
    if (closing.pendingExpenses.count > 0) {
      lines.push([
        "Pending (not yet included)",
        `${closing.pendingExpenses.count} expense(s), ${this.money(closing.pendingExpenses.amount, cur)}`,
      ]);
    }

    for (const [label, value] of lines) {
      this.tableRow(doc, [label, value], [260, 200]);
    }

    return this.toBuffer(doc);
  }

  async financialReportPdf(storeId: string, period: "monthly" | "yearly", key: string): Promise<Buffer> {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const cur = store.currency;

    if (period === "monthly") {
      const report = await this.dashboard.getMonthlyReport(storeId, key);
      const doc = this.newDoc(`Monthly Financial Report — ${report.month}`, store.name);
      const lines: [string, string][] = [
        ["Total revenue", this.money(report.totalRevenue, cur)],
        ["Total expenses", this.money(report.totalExpenses, cur)],
        ["Net income", this.money(report.netIncome, cur)],
        ["Expense ratio", report.expenseRatioPct === null ? "—" : `${report.expenseRatioPct.toFixed(1)}%`],
        ["Transactions", String(report.transactionCount)],
        [
          "Average transaction",
          report.averageTransactionValue === null ? "—" : this.money(report.averageTransactionValue, cur),
        ],
        [
          "Best sales day",
          report.bestSalesDay ? `${report.bestSalesDay.date} (${this.money(report.bestSalesDay.amount, cur)})` : "—",
        ],
        [
          "Highest expense day",
          report.highestExpenseDay
            ? `${report.highestExpenseDay.date} (${this.money(report.highestExpenseDay.amount, cur)})`
            : "—",
        ],
      ];
      for (const [label, value] of lines) this.tableRow(doc, [label, value], [260, 200]);

      if (report.topExpenseCategories.length > 0) {
        doc.moveDown(0.8);
        doc.font("Helvetica-Bold").fontSize(11).text("Top expense categories");
        doc.moveDown(0.3);
        for (const c of report.topExpenseCategories) {
          this.tableRow(doc, [c.categoryName, this.money(c.amount, cur)], [260, 200]);
        }
      }
      return this.toBuffer(doc);
    }

    const report = await this.dashboard.getYearlyReport(storeId, Number(key));
    const doc = this.newDoc(`Yearly Financial Report — ${report.year}`, store.name);
    const lines: [string, string][] = [
      ["Total revenue", this.money(report.totalRevenue, cur)],
      ["Total expenses", this.money(report.totalExpenses, cur)],
      ["Net income", this.money(report.netIncome, cur)],
      [
        "Best month",
        report.bestMonth ? `${report.bestMonth.label} (${this.money(report.bestMonth.netIncome, cur)})` : "—",
      ],
      [
        "Worst month",
        report.worstMonth ? `${report.worstMonth.label} (${this.money(report.worstMonth.netIncome, cur)})` : "—",
      ],
    ];
    for (const [label, value] of lines) this.tableRow(doc, [label, value], [260, 200]);

    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(11).text("Monthly comparison");
    doc.moveDown(0.3);
    const widths = [80, 130, 130, 130];
    this.tableRow(doc, ["Month", "Revenue", "Expenses", "Net Income"], widths, { bold: true });
    for (const m of report.monthlyComparison) {
      this.tableRow(
        doc,
        [m.label, this.money(m.revenue, cur), this.money(m.expenses, cur), this.money(m.netIncome, cur)],
        widths,
      );
    }

    return this.toBuffer(doc);
  }
}
