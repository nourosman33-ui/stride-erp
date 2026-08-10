import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { FinanceModule } from "../finance/finance.module";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";
import { ExpenseAnalyticsService } from "./expense-analytics.service";
import { CashFlowService } from "./cash-flow.service";
import { CashCountsController } from "./cash-counts.controller";
import { FinancialDashboardService } from "./financial-dashboard.service";
import { FinancialDashboardController } from "./financial-dashboard.controller";
import { ReceiptStorageService } from "./receipt-storage.service";

@Module({
  imports: [AuditModule, FinanceModule],
  controllers: [ExpensesController, CashCountsController, FinancialDashboardController],
  providers: [
    ExpensesService,
    ExpenseAnalyticsService,
    CashFlowService,
    FinancialDashboardService,
    ReceiptStorageService,
  ],
  exports: [ExpensesService, ExpenseAnalyticsService, CashFlowService, FinancialDashboardService],
})
export class ExpensesModule {}
