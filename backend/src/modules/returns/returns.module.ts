import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { InventoryModule } from "../inventory/inventory.module";
import { CustomersModule } from "../customers/customers.module";
import { SalesModule } from "../sales/sales.module";
import { SessionsModule } from "../sessions/sessions.module";
import { ReturnsController } from "./returns.controller";
import { ReturnsService } from "./returns.service";

@Module({
  imports: [AuditModule, InventoryModule, CustomersModule, SalesModule, SessionsModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
