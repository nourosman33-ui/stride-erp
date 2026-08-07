import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { AiService } from "./ai.service";
import { SendMessageDto } from "./dto/send-message.dto";

/** Owner-only, enforced here rather than left to the frontend hiding the nav link. */
@Controller("ai")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("owner")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("chat")
  sendMessage(@Body() dto: SendMessageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.aiService.sendMessage(user.userId, dto);
  }

  @Get("conversations")
  listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.listConversations(user.userId);
  }

  @Get("conversations/:id")
  getConversation(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiService.getConversation(id, user.userId);
  }

  @Get("insights")
  getInsights(@Query("storeId") storeId: string) {
    return this.aiService.getInsights(storeId);
  }
}
