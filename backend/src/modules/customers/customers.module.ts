import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { CustomersService } from "./customers.service";
import { CustomersController } from "./customers.controller";

@Module({
  imports: [AuditModule],
  providers: [CustomersService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}
