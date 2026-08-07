"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, MessageSquarePlus, Send, ShieldAlert, TrendingDown, TrendingUp, User } from "lucide-react";
import { toast } from "sonner";

import { getConversation, getInsights, listConversations, sendChatMessage } from "@/lib/api/ai";
import type { AiMessage } from "@/lib/api/types";
import { useAuth } from "@/lib/auth-context";
import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { NoStoreSelected } from "@/components/no-store-selected";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

function AccessDenied() {
  const { t } = useLocale();
  return (
    <div className="space-y-4">
      <PageHeader title={t("aiAssistant.title")} description={t("aiAssistant.description")} />
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <ShieldAlert className="size-10 text-muted-foreground" />
          <p className="font-medium">{t("aiAssistant.accessDeniedTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("aiAssistant.accessDeniedDesc")}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function InsightsPanel({ storeId }: { storeId: string }) {
  const { t } = useLocale();
  const { data: insights, isLoading } = useQuery({
    queryKey: ["ai-insights", storeId],
    queryFn: () => getInsights(storeId),
  });

  if (isLoading || !insights) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("aiAssistant.insightsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  const weekUp = (insights.weekComparison.changePct ?? 0) >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("aiAssistant.insightsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border p-2">
            <p className="text-xs text-muted-foreground">{t("aiAssistant.revenueToday")}</p>
            <p className="font-semibold">{formatMoney(insights.revenueToday.revenue)}</p>
            <p className="text-xs text-muted-foreground">
              {t("aiAssistant.ordersCount", { count: insights.revenueToday.orderCount })}
            </p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-xs text-muted-foreground">{t("aiAssistant.profitToday")}</p>
            <p className="font-semibold">{formatMoney(insights.profitToday.profit)}</p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-xs text-muted-foreground">{t("aiAssistant.unitsSoldToday")}</p>
            <p className="font-semibold">{formatNumber(insights.unitsSoldToday.unitsSold)}</p>
          </div>
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {weekUp ? <TrendingUp className="size-3.5 text-success" /> : <TrendingDown className="size-3.5 text-destructive" />}
            {t("aiAssistant.weekOverWeek")}
          </p>
          <p className={weekUp ? "text-success" : "text-destructive"}>
            {insights.weekComparison.changePct === null ? "—" : `${insights.weekComparison.changePct}%`}
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("aiAssistant.topProductsThisWeek")}</p>
          <div className="space-y-1">
            {insights.topProducts.map((p) => (
              <div key={p.variantId} className="flex justify-between text-xs">
                <span className="truncate">
                  {p.productName} · {p.colorName} · {p.sizeLabel}
                </span>
                <span className="shrink-0 font-medium">{p.unitsSold}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("aiAssistant.lowStockAlerts")}</p>
          {insights.lowStock.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("aiAssistant.noLowStock")}</p>
          ) : (
            <div className="space-y-1">
              {insights.lowStock.slice(0, 5).map((r) => (
                <div key={r.variantId} className="flex justify-between text-xs">
                  <span className="truncate">{r.productName}</span>
                  <Badge variant="warning" className="shrink-0">
                    {r.quantityOnHand}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("aiAssistant.recommendations")}</p>
          <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            {insights.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function ChatBubble({ message }: { message: AiMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

export default function AiAssistantPage() {
  const { hasRole } = useAuth();
  const { activeStore, activeStoreId, isLoading: storeLoading } = useActiveStore();
  const { t } = useLocale();
  const queryClient = useQueryClient();

  const [conversationId, setConversationId] = React.useState<string | undefined>();
  const [messages, setMessages] = React.useState<AiMessage[]>([]);
  const [input, setInput] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery({
    queryKey: ["ai-conversations"],
    queryFn: listConversations,
    enabled: hasRole("owner"),
  });

  const loadConversationMutation = useMutation({
    mutationFn: (id: string) => getConversation(id),
    onSuccess: (conv) => {
      setConversationId(conv.id);
      setMessages(conv.messages ?? []);
    },
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      sendChatMessage({ storeId: activeStoreId!, conversationId, message }),
    onSuccess: (res) => {
      setConversationId(res.conversationId);
      setMessages((prev) => [...prev, res.message]);
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("aiAssistant.sendFailed"));
      setMessages((prev) => prev.slice(0, -1));
    },
  });

  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMutation.isPending]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;
    const optimisticUser: AiMessage = {
      id: `local-${Date.now()}`,
      conversationId: conversationId ?? "",
      role: "user",
      content: trimmed,
      toolCalls: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");
    sendMutation.mutate(trimmed);
  }

  function startNewChat() {
    setConversationId(undefined);
    setMessages([]);
  }

  if (!hasRole("owner")) {
    return <AccessDenied />;
  }

  if (!storeLoading && !activeStore) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("aiAssistant.title")} description={t("aiAssistant.description")} />
        <NoStoreSelected />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("aiAssistant.title")} description={activeStore?.name} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="flex h-[560px] flex-col">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t("nav.aiAssistant")}</CardTitle>
              <Button variant="outline" size="sm" onClick={startNewChat}>
                <MessageSquarePlus className="size-4" />
                {t("aiAssistant.newChat")}
              </Button>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden">
              <ScrollArea className="flex-1 pe-3">
                {messages.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">{t("aiAssistant.emptyState")}</p>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m) => (
                      <ChatBubble key={m.id} message={m} />
                    ))}
                    {sendMutation.isPending && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        {t("aiAssistant.thinking")}
                      </div>
                    )}
                    <div ref={scrollRef} />
                  </div>
                )}
              </ScrollArea>
              <form onSubmit={handleSend} className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                  placeholder={t("aiAssistant.inputPlaceholder")}
                  rows={2}
                  className="flex-1 resize-none"
                />
                <Button type="submit" size="icon" disabled={!input.trim() || sendMutation.isPending}>
                  <Send className="size-4" />
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("aiAssistant.recentChats")}</CardTitle>
            </CardHeader>
            <CardContent>
              {!conversations || conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("aiAssistant.noChatsYet")}</p>
              ) : (
                <div className="space-y-1">
                  {conversations.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => loadConversationMutation.mutate(c.id)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-start text-sm hover:bg-accent ${
                        c.id === conversationId ? "bg-accent" : ""
                      }`}
                    >
                      <span className="truncate">{c.title ?? t("aiAssistant.newChat")}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(c.updatedAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>{activeStoreId && <InsightsPanel storeId={activeStoreId} />}</div>
      </div>
    </div>
  );
}
