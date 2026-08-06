import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PurchasingController, PurchaseReturnsController } from "./purchasing.controller";
import { PurchasingService } from "./purchasing.service";

@Module({
  imports: [AuditModule, InventoryModule],
  controllers: [PurchasingController, PurchaseReturnsController],
  providers: [PurchasingService],
  exports: [PurchasingService],
})
export class PurchasingModule {}
