import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InventoryModule } from "../inventory/inventory.module";
import { AiToolsService } from "./ai-tools.service";
import { AiService } from "./ai.service";
import { AiController } from "./ai.controller";
import { MockAiProvider } from "./providers/mock-ai.provider";
import { OpenAiProvider } from "./providers/openai-ai.provider";
import { AI_PROVIDER } from "./providers/ai-provider.interface";

/**
 * Provider swap point: MockAiProvider (real data, keyword-matched, no API key) is used
 * unless OPENAI_API_KEY is set in the environment, in which case OpenAiProvider takes
 * over automatically — no code change needed elsewhere when the key is added later.
 */
@Module({
  imports: [InventoryModule],
  providers: [
    AiToolsService,
    MockAiProvider,
    OpenAiProvider,
    AiService,
    {
      provide: AI_PROVIDER,
      useFactory: (mock: MockAiProvider, openai: OpenAiProvider, config: ConfigService) =>
        config.get<string>("OPENAI_API_KEY") ? openai : mock,
      inject: [MockAiProvider, OpenAiProvider, ConfigService],
    },
  ],
  controllers: [AiController],
})
export class AiModule {}
