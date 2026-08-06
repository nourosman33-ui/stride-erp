import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { StoreModule } from "./modules/store/store.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { SuppliersModule } from "./modules/suppliers/suppliers.module";
import { PurchasingModule } from "./modules/purchasing/purchasing.module";
import { InventoryModule } from "./modules/inventory/inventory.module";

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
  ],
})
export class AppModule {}
