import { Injectable } from "@nestjs/common";
import { AiToolsService } from "../ai-tools.service";
import type { AiProvider, AiReplyResult, AiToolCallRecord } from "./ai-provider.interface";

/**
 * Keyword/intent-matched "AI" — no API key, no network call, but every answer is real
 * data from AiToolsService, not canned text. This is the default provider (see
 * AiModule); OpenAiProvider implements the exact same AiProvider interface and takes
 * over the moment OPENAI_API_KEY is configured, with zero changes needed anywhere else
 * (AiService, the controller, the frontend chat UI all depend only on the interface).
 */
@Injectable()
export class MockAiProvider implements AiProvider {
  constructor(private readonly tools: AiToolsService) {}

  async reply({ storeId, message }: { storeId: string; message: string }): Promise<AiReplyResult> {
    const text = message.toLowerCase();
    const toolCalls: AiToolCallRecord[] = [];

    const call = async <T>(tool: string, fn: () => Promise<T>): Promise<T> => {
      const output = await fn();
      toolCalls.push({ tool, output });
      return output;
    };

    if (/revenue/.test(text) && /today/.test(text)) {
      const r = await call("revenueToday", () => this.tools.revenueToday(storeId));
      return {
        content: `Today's revenue is EGP ${r.revenue.toFixed(2)} across ${r.orderCount} order(s).`,
        toolCalls,
      };
    }

    if (/profit/.test(text) && /today/.test(text)) {
      const r = await call("profitToday", () => this.tools.profitToday(storeId));
      return {
        content: `Today's estimated profit is EGP ${r.profit.toFixed(2)} (revenue EGP ${r.revenue.toFixed(2)} minus an estimated cost of goods sold of EGP ${r.cogs.toFixed(2)}, based on weighted-average receipt cost).`,
        toolCalls,
      };
    }

    if (/today/.test(text) && /(sold|units|shoes|pairs)/.test(text)) {
      const r = await call("unitsSoldToday", () => this.tools.unitsSoldToday(storeId));
      return { content: `${r.unitsSold} unit(s) were sold today.`, toolCalls };
    }

    if (/expense/.test(text)) {
      const r = await call("expensesToday", () => this.tools.expensesToday());
      return { content: r.message, toolCalls };
    }

    if (/(best|top).*cashier/.test(text)) {
      const r = await call("bestCashier", () => this.tools.bestCashier(storeId));
      return {
        content: r
          ? `${r.cashierName} is today's top cashier — EGP ${r.revenue.toFixed(2)} across ${r.orderCount} sale(s).`
          : "No sales have been recorded yet today.",
        toolCalls,
      };
    }

    if (/(fastest|best.?sell|top product)/.test(text)) {
      const r = await call("fastestSellingProducts", () => this.tools.fastestSellingProducts(storeId));
      return {
        content: this.formatList(
          "Fastest-selling products (last 30 days)",
          r,
          (p) => `${p.productName} (${p.colorName}/${p.sizeLabel}) — ${p.unitsSold} sold`,
        ),
        toolCalls,
      };
    }

    if (/(not selling|slow.?mov|dead stock)/.test(text)) {
      const r = await call("slowMovingProducts", () => this.tools.slowMovingProducts(storeId));
      return {
        content: this.formatList(
          "Slow-moving / dead stock",
          r,
          (p) => `${p.productName} — ${p.quantityOnHand} on hand (${p.status})`,
        ),
        toolCalls,
      };
    }

    if (/reorder/.test(text)) {
      const r = await call("reorderSuggestions", () => this.tools.reorderSuggestions(storeId));
      return {
        content: this.formatList(
          "Suggested reorders",
          r,
          (p) => `${p.productName ?? p.variantId} — ${p.quantityOnHand} on hand`,
        ),
        toolCalls,
      };
    }

    if (/inventory value/.test(text)) {
      const r = await call("inventoryValue", () => this.tools.inventoryValue(storeId));
      return { content: `Current inventory value is EGP ${r.totalInventoryValue.toFixed(2)}.`, toolCalls };
    }

    if (/supplier/.test(text) && /(pay|payable|owe)/.test(text)) {
      const r = await call("supplierPayables", () => this.tools.supplierPayables());
      if (r.length === 0) {
        return { content: "No outstanding supplier balances.", toolCalls };
      }
      const rest = r
        .slice(1)
        .map((s) => `${s.supplierName} (EGP ${s.balanceOwed.toFixed(2)})`)
        .join(", ");
      return {
        content: `Pay ${r[0].supplierName} first — EGP ${r[0].balanceOwed.toFixed(2)} outstanding.${rest ? ` Other balances: ${rest}.` : ""}`,
        toolCalls,
      };
    }

    if (/week/.test(text) && /(compar|vs|last)/.test(text)) {
      const r = await call("weekComparison", () => this.tools.weekComparison(storeId));
      return {
        content: `This week: EGP ${r.thisWeekRevenue.toFixed(2)} vs last week EGP ${r.lastWeekRevenue.toFixed(2)}${
          r.changePct !== null ? ` (${r.changePct >= 0 ? "+" : ""}${r.changePct}%)` : ""
        }.`,
        toolCalls,
      };
    }

    if (/month/.test(text) && /(compar|vs|last)/.test(text)) {
      const r = await call("monthComparison", () => this.tools.monthComparison(storeId));
      return {
        content: `This month so far: EGP ${r.thisMonthRevenue.toFixed(2)} vs last month EGP ${r.lastMonthRevenue.toFixed(2)}${
          r.changePct !== null ? ` (${r.changePct >= 0 ? "+" : ""}${r.changePct}%)` : ""
        }.`,
        toolCalls,
      };
    }

    if (/discount/.test(text)) {
      const r = await call("discountCandidates", () => this.tools.discountCandidates(storeId));
      return {
        content: this.formatList(
          "Good candidates for a discount (slow/dead stock)",
          r,
          (p) => `${p.productName} — ${p.quantityOnHand} on hand (${p.status})`,
        ),
        toolCalls,
      };
    }

    if (/price/.test(text) && /(increase|raise)/.test(text)) {
      const r = await call("priceIncreaseCandidates", () => this.tools.priceIncreaseCandidates(storeId));
      return {
        content: this.formatList(
          "Good candidates for a price increase (fast movers)",
          r,
          (p) => p.productName ?? p.variantId,
        ),
        toolCalls,
      };
    }

    if (/forecast/.test(text) && /revenue/.test(text)) {
      const r = await call("forecastEndOfMonthRevenue", () => this.tools.forecastEndOfMonthRevenue(storeId));
      return {
        content: `Projected end-of-month revenue: EGP ${r.forecastEndOfMonthRevenue.toFixed(2)} (month-to-date EGP ${r.monthToDateRevenue.toFixed(2)}, trailing daily average EGP ${r.dailyAverage.toFixed(2)}).`,
        toolCalls,
      };
    }

    if (/forecast/.test(text) && /(stock|shortage|out of stock)/.test(text)) {
      const r = await call("forecastStockShortages", () => this.tools.forecastStockShortages(storeId));
      return {
        content: this.formatList(
          "Forecast stock shortages (under 14 days of cover)",
          r,
          (p) => `${p.productName} — ~${p.daysOfCover} day(s) of cover left`,
        ),
        toolCalls,
      };
    }

    return {
      content:
        "I can help with: today's revenue/profit/units sold, best cashier, fastest/slowest-selling products, reorder suggestions, inventory value, supplier payables, week/month comparisons, discount or price-increase candidates, and revenue/stock forecasts. Try asking one of those.",
      toolCalls,
    };
  }

  private formatList<T>(title: string, items: T[], line: (item: T) => string): string {
    if (items.length === 0) return `${title}: none right now.`;
    return `${title}:\n${items.map((i) => `• ${line(i)}`).join("\n")}`;
  }
}
