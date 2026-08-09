import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { InventoryModule } from "../inventory/inventory.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { ForecastService } from "./forecast.service";

@Module({
  imports: [AuditModule, InventoryModule],
  controllers: [FinanceController],
  providers: [FinanceService, ForecastService],
  exports: [FinanceService, ForecastService],
})
export class FinanceModule {}
