import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { FinanceModule } from "../finance/finance.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ExportController } from "./export.controller";
import { ExportService } from "./export.service";
import { FeedsController } from "./feeds.controller";
import { FeedsService } from "./feeds.service";

@Module({
  imports: [AuditModule, FinanceModule, InventoryModule],
  controllers: [ExportController, FeedsController],
  providers: [ExportService, FeedsService],
})
export class ExportModule {}
