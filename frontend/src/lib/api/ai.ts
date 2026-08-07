import { apiFetch } from "./client";
import type { AiConversation, AiInsights, AiMessage } from "./types";

export interface SendChatMessageInput {
  storeId: string;
  conversationId?: string;
  message: string;
}

export function sendChatMessage(input: SendChatMessageInput) {
  return apiFetch<{ conversationId: string; message: AiMessage }>("/ai/chat", {
    method: "POST",
    body: input,
  });
}

export function listConversations() {
  return apiFetch<AiConversation[]>("/ai/conversations");
}

export function getConversation(id: string) {
  return apiFetch<AiConversation>(`/ai/conversations/${id}`);
}

export function getInsights(storeId: string) {
  return apiFetch<AiInsights>("/ai/insights", { params: { storeId } });
}
