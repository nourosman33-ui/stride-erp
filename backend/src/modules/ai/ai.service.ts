import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AiToolsService } from "./ai-tools.service";
import { AI_PROVIDER, type AiProvider } from "./providers/ai-provider.interface";
import { SendMessageDto } from "./dto/send-message.dto";

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: AiToolsService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  listConversations(ownerId: string) {
    return this.prisma.aiConversation.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getConversation(id: string, ownerId: string) {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversation || conversation.ownerId !== ownerId) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    return conversation;
  }

  async sendMessage(ownerId: string, dto: SendMessageDto) {
    let conversation = dto.conversationId
      ? await this.prisma.aiConversation.findUnique({
          where: { id: dto.conversationId },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        })
      : null;

    if (conversation && conversation.ownerId !== ownerId) {
      throw new ForbiddenException("This conversation does not belong to you");
    }

    if (!conversation) {
      conversation = await this.prisma.aiConversation.create({
        data: { ownerId, storeId: dto.storeId, title: dto.message.slice(0, 60) },
        include: { messages: true },
      });
    }

    await this.prisma.aiMessage.create({
      data: { conversationId: conversation.id, role: "user", content: dto.message },
    });

    const history = conversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const result = await this.provider.reply({ storeId: dto.storeId, message: dto.message, history });

    const assistantMessage = await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: result.content,
        toolCalls: result.toolCalls as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return { conversationId: conversation.id, message: assistantMessage };
  }

  /**
   * Proactive summary shown when the owner logs in / opens the dashboard — composed
   * directly from AiToolsService (deterministic dashboard data), not routed through the
   * chat provider.
   */
  async getInsights(storeId: string) {
    const [revenueToday, profitToday, unitsSoldToday, topProducts, lowStock, week] = await Promise.all([
      this.tools.revenueToday(storeId),
      this.tools.profitToday(storeId),
      this.tools.unitsSoldToday(storeId),
      this.tools.fastestSellingProducts(storeId, 7, 5),
      this.tools.reorderSuggestions(storeId),
      this.tools.weekComparison(storeId),
    ]);

    const recommendations: string[] = [];
    if (lowStock.length > 0) {
      recommendations.push(
        `${lowStock.length} variant(s) are at or below their reorder point — consider a purchase order.`,
      );
    }
    if (week.changePct !== null && week.changePct < 0) {
      recommendations.push(`Revenue is down ${Math.abs(week.changePct)}% vs last week.`);
    } else if (week.changePct !== null && week.changePct > 0) {
      recommendations.push(`Revenue is up ${week.changePct}% vs last week — keep it up.`);
    }
    if (topProducts.length > 0) {
      recommendations.push(
        `${topProducts[0].productName} is your fastest mover this week — make sure it stays well stocked.`,
      );
    }
    if (recommendations.length === 0) {
      recommendations.push("Nothing urgent today — business looks steady.");
    }

    return { revenueToday, profitToday, unitsSoldToday, topProducts, lowStock, weekComparison: week, recommendations };
  }
}
