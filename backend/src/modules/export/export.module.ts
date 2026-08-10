import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { FinanceModule } from "../finance/finance.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ExpensesModule } from "../expenses/expenses.module";
import { ExportController } from "./export.controller";
import { ExportService } from "./export.service";
import { ExportPdfService } from "./export-pdf.service";
import { FeedsController } from "./feeds.controller";
import { FeedsService } from "./feeds.service";

@Module({
  imports: [AuditModule, FinanceModule, InventoryModule, ExpensesModule],
  controllers: [ExportController, FeedsController],
  providers: [ExportService, ExportPdfService, FeedsService],
})
export class ExportModule {}
