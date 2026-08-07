import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiToolsService } from "../ai-tools.service";
import type { AiChatMessage, AiProvider, AiReplyResult, AiToolCallRecord } from "./ai-provider.interface";

// storeId is bound server-side per request, never a model-chosen parameter — the model
// can only ever query the caller's own store.
const TOOL_SCHEMAS = [
  { name: "revenueToday", description: "Today's revenue and order count." },
  { name: "profitToday", description: "Today's revenue, estimated COGS, and estimated profit." },
  { name: "unitsSoldToday", description: "Total units sold today." },
  { name: "expensesToday", description: "Today's tracked expenses, if any." },
  { name: "bestCashier", description: "The cashier with the most revenue today." },
  { name: "fastestSellingProducts", description: "Top-selling products over the last 30 days." },
  { name: "slowMovingProducts", description: "Slow-moving or dead-stock products." },
  { name: "reorderSuggestions", description: "Variants at or below their reorder point." },
  { name: "inventoryValue", description: "Current total inventory value." },
  { name: "supplierPayables", description: "Suppliers ranked by outstanding balance owed." },
  { name: "weekComparison", description: "This week's revenue vs last week's." },
  { name: "monthComparison", description: "This month's revenue vs last month's." },
  { name: "discountCandidates", description: "Products that are good candidates for a discount." },
  { name: "priceIncreaseCandidates", description: "Products that are good candidates for a price increase." },
  { name: "forecastEndOfMonthRevenue", description: "Naive linear forecast of end-of-month revenue." },
  { name: "forecastStockShortages", description: "Variants forecast to run out within ~2 weeks." },
] as const;

type ToolName = (typeof TOOL_SCHEMAS)[number]["name"];

const SYSTEM_PROMPT =
  "You are the owner-only business assistant for a shoe retail ERP (STRIDE ERP). Answer using only the " +
  "tool results provided to you — never invent numbers. Be concise and concrete (use EGP amounts, product " +
  "names, and percentages where relevant). If a tool returns no data, say so plainly.";

/**
 * Real OpenAI function-calling implementation — inactive until OPENAI_API_KEY is set (see
 * AiModule's provider factory, which falls back to MockAiProvider otherwise). Implements
 * the exact same AiProvider interface as the mock, so activating this later is a config
 * change, not a code change.
 */
@Injectable()
export class OpenAiProvider implements AiProvider {
  constructor(
    private readonly tools: AiToolsService,
    private readonly config: ConfigService,
  ) {}

  private get apiKey(): string | undefined {
    return this.config.get<string>("OPENAI_API_KEY");
  }

  private get model(): string {
    return this.config.get<string>("OPENAI_MODEL") ?? "gpt-4o-mini";
  }

  async reply(params: { storeId: string; message: string; history: AiChatMessage[] }): Promise<AiReplyResult> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured — OpenAiProvider should not be active without it.");
    }

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...params.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: params.message },
    ];

    const toolCalls: AiToolCallRecord[] = [];
    const first = await this.callOpenAi(messages);
    const requestedToolCalls = first.choices?.[0]?.message?.tool_calls as
      | Array<{ id: string; function: { name: string; arguments: string } }>
      | undefined;

    if (!requestedToolCalls || requestedToolCalls.length === 0) {
      return { content: first.choices?.[0]?.message?.content ?? "", toolCalls };
    }

    messages.push(first.choices[0].message);
    for (const call of requestedToolCalls) {
      const output = await this.runTool(call.function.name as ToolName, params.storeId);
      toolCalls.push({ tool: call.function.name, output });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output) });
    }

    const second = await this.callOpenAi(messages);
    return { content: second.choices?.[0]?.message?.content ?? "", toolCalls };
  }

  private async callOpenAi(messages: Array<Record<string, unknown>>) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: TOOL_SCHEMAS.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: { type: "object", properties: {} } },
        })),
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  private runTool(name: ToolName, storeId: string): Promise<unknown> {
    switch (name) {
      case "revenueToday":
        return this.tools.revenueToday(storeId);
      case "profitToday":
        return this.tools.profitToday(storeId);
      case "unitsSoldToday":
        return this.tools.unitsSoldToday(storeId);
      case "expensesToday":
        return this.tools.expensesToday();
      case "bestCashier":
        return this.tools.bestCashier(storeId);
      case "fastestSellingProducts":
        return this.tools.fastestSellingProducts(storeId);
      case "slowMovingProducts":
        return this.tools.slowMovingProducts(storeId);
      case "reorderSuggestions":
        return this.tools.reorderSuggestions(storeId);
      case "inventoryValue":
        return this.tools.inventoryValue(storeId);
      case "supplierPayables":
        return this.tools.supplierPayables();
      case "weekComparison":
        return this.tools.weekComparison(storeId);
      case "monthComparison":
        return this.tools.monthComparison(storeId);
      case "discountCandidates":
        return this.tools.discountCandidates(storeId);
      case "priceIncreaseCandidates":
        return this.tools.priceIncreaseCandidates(storeId);
      case "forecastEndOfMonthRevenue":
        return this.tools.forecastEndOfMonthRevenue(storeId);
      case "forecastStockShortages":
        return this.tools.forecastStockShortages(storeId);
      default:
        return Promise.resolve(null);
    }
  }
}
