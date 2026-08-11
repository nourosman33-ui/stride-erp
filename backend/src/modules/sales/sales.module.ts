import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { InventoryModule } from "../inventory/inventory.module";
import { CustomersModule } from "../customers/customers.module";
import { SessionsModule } from "../sessions/sessions.module";
import { SalesService } from "./sales.service";
import { SalesController } from "./sales.controller";

@Module({
  imports: [AuditModule, InventoryModule, CustomersModule, SessionsModule],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}
