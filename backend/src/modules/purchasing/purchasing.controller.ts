import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { PurchasingService } from "./purchasing.service";
import { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import { ReceiveGoodsDto } from "./dto/receive-goods.dto";
import { CreatePurchaseReturnDto } from "./dto/create-purchase-return.dto";

@Controller("purchase-orders")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasingController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Post()
  @Roles("owner", "manager", "inventory_clerk")
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.purchasingService.createPurchaseOrder(dto, user.userId);
  }

  @Get()
  findAll(@Query("storeId") storeId?: string) {
    return this.purchasingService.findAll(storeId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.purchasingService.findOne(id);
  }

  @Post(":id/approve")
  @Roles("owner", "manager")
  approve(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.purchasingService.approve(id, user.userId);
  }

  @Post(":id/receive")
  @Roles("owner", "manager", "inventory_clerk")
  receiveGoods(
    @Param("id") id: string,
    @Body() dto: ReceiveGoodsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchasingService.receiveGoods(id, dto, user.userId);
  }
}

@Controller("purchase-returns")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseReturnsController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Post()
  @Roles("owner", "manager", "inventory_clerk")
  create(@Body() dto: CreatePurchaseReturnDto, @CurrentUser() user: AuthenticatedUser) {
    return this.purchasingService.createPurchaseReturn(dto, user.userId);
  }
}
