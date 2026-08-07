import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { AdjustLoyaltyDto } from "./dto/adjust-loyalty.dto";

@Controller("customers")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // Cashiers create customers inline from POS during checkout (FR-CRM/loyalty) — no cost
  // data is ever attached to a customer record, so this is safe to leave cashier-reachable.
  @Post()
  @Roles("owner", "manager", "cashier")
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Get()
  findAll(@Query("search") search?: string) {
    return this.customersService.findAll(search);
  }

  // Registered before ":id" so "phone" isn't swallowed by the dynamic id route.
  @Get("phone/:phone")
  findByPhone(@Param("phone") phone: string) {
    return this.customersService.findByPhone(phone);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Query("storeId") storeId?: string) {
    return this.customersService.findOne(id, storeId);
  }

  @Patch(":id")
  @Roles("owner", "manager", "cashier")
  update(@Param("id") id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Post(":id/loyalty/adjust")
  @Roles("owner", "manager")
  adjustLoyalty(
    @Param("id") id: string,
    @Body() dto: AdjustLoyaltyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.adjustLoyalty(id, dto, user.userId);
  }
}
