import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
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

  // Purchase order costs/totals — never available to cashiers.
  @Get()
  @Roles("owner", "manager", "inventory_clerk", "accountant")
  findAll(@Query("storeId") storeId?: string) {
    return this.purchasingService.findAll(storeId);
  }

  @Get(":id")
  @Roles("owner", "manager", "inventory_clerk", "accountant")
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

  /** Owner only. Refused once anything has been received — cancel those instead. */
  @Delete(":id")
  @Roles("owner")
  deleteOrder(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.purchasingService.deletePurchaseOrder(id, user.userId);
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

  @Get()
  @Roles("owner", "manager", "inventory_clerk", "accountant")
  findAll(@Query("storeId") storeId?: string) {
    return this.purchasingService.findAllReturns(storeId);
  }

  /**
   * Undoes a return: posts a compensating receipt so the stock comes back, then removes
   * the return document. Owner only — it moves stock.
   */
  @Delete(":id")
  @Roles("owner")
  reverse(
    @Param("id") id: string,
    @Query("storeId") storeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchasingService.reversePurchaseReturn(id, storeId, user.userId);
  }
}
