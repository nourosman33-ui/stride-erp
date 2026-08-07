import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { SalesService } from "./sales.service";
import { CreateSaleDto } from "./dto/create-sale.dto";

@Controller("sales")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post("checkout")
  @Roles("owner", "manager", "cashier")
  checkout(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.salesService.checkout(dto, user.userId);
  }

  /**
   * Cashier-safe: no @Roles restriction, but the service never selects cost fields —
   * see SalesService.getPosCatalog. Registered before ":id" so "pos-catalog" isn't
   * swallowed by the dynamic id route.
   */
  @Get("pos-catalog")
  getPosCatalog(@Query("storeId") storeId: string) {
    return this.salesService.getPosCatalog(storeId);
  }

  @Get()
  findAll(@Query("storeId") storeId?: string) {
    return this.salesService.findAll(storeId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.salesService.findOne(id);
  }
}
