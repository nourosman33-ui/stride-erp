export interface AiChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AiToolCallRecord {
  tool: string;
  input?: Record<string, unknown>;
  output: unknown;
}

export interface AiReplyResult {
  content: string;
  toolCalls: AiToolCallRecord[];
}

/**
 * Swap point for the AI backend. MockAiProvider (keyword-matched, real data, no API key)
 * is the default; OpenAiProvider (function-calling over the same AiToolsService) takes
 * over automatically once OPENAI_API_KEY is set — see AiModule's provider factory. Both
 * implementations must ground every answer in AiToolsService — neither may fabricate
 * numbers.
 */
export interface AiProvider {
  reply(params: {
    storeId: string;
    message: string;
    history: AiChatMessage[];
  }): Promise<AiReplyResult>;
}

export const AI_PROVIDER = Symbol("AI_PROVIDER");
