import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { StoreModule } from "./modules/store/store.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { SuppliersModule } from "./modules/suppliers/suppliers.module";
import { PurchasingModule } from "./modules/purchasing/purchasing.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { SalesModule } from './modules/sales/sales.module';
import { CustomersModule } from "./modules/customers/customers.module";
import { AiModule } from "./modules/ai/ai.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { ReturnsModule } from "./modules/returns/returns.module";
import { ExportModule } from "./modules/export/export.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    IdentityModule,
    StoreModule,
    CatalogModule,
    SuppliersModule,
    PurchasingModule,
    InventoryModule,
    SalesModule,
    CustomersModule,
    AiModule,
    FinanceModule,
    ReturnsModule,
    ExportModule,
  ],
})
export class AppModule {}
