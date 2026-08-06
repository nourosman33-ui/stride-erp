import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { StoreController } from "./store.controller";
import { StoreService } from "./store.service";

@Module({
  imports: [AuditModule],
  controllers: [StoreController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
