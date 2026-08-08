import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { ReturnsService } from "./returns.service";
import { CreateReturnDto } from "./dto/create-return.dto";

/**
 * Cashier-accessible: taking returns is front-counter work. Nothing here exposes cost or
 * supplier data (see RETURN_INCLUDE in ReturnsService), so the cashier restriction that
 * applies to catalog/inventory endpoints isn't needed. Accepting a return *outside* the
 * store's return window still requires a manager or owner — enforced in the service.
 */
@Controller("returns")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  /** What's still returnable on a sale — drives the returns screen. */
  @Get("eligibility/:orderId")
  @Roles("owner", "manager", "cashier")
  getEligibility(@Param("orderId") orderId: string) {
    return this.returns.getEligibility(orderId);
  }

  @Post()
  @Roles("owner", "manager", "cashier")
  create(@Body() dto: CreateReturnDto, @CurrentUser() user: AuthenticatedUser) {
    return this.returns.createReturn(dto, user.userId, user.roles);
  }

  @Get()
  @Roles("owner", "manager", "cashier", "accountant")
  findAll(@Query("storeId") storeId?: string) {
    return this.returns.findAll(storeId);
  }

  @Get(":id")
  @Roles("owner", "manager", "cashier", "accountant")
  findOne(@Param("id") id: string) {
    return this.returns.findOne(id);
  }
}
