import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { InventoryModule } from "../inventory/inventory.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

@Module({
  imports: [AuditModule, InventoryModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
