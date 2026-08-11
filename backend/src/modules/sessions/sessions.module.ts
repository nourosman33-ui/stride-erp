import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { SessionsController, TransactionLogController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";
import { TransactionLogService } from "./transaction-log.service";

@Module({
  imports: [AuditModule],
  controllers: [SessionsController, TransactionLogController],
  providers: [SessionsService, TransactionLogService],
  // Exported so the sales, returns and expenses write paths can stamp the active
  // session id onto the rows they create.
  exports: [SessionsService, TransactionLogService],
})
export class SessionsModule {}
