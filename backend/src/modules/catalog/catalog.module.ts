import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { LookupsController } from "./lookups.controller";
import { LookupsService } from "./lookups.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [AuditModule],
  controllers: [LookupsController, ProductsController],
  providers: [LookupsService, ProductsService],
  exports: [ProductsService],
})
export class CatalogModule {}
