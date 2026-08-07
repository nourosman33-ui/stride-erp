import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { ProductsService } from "./products.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateVariantDto } from "./dto/create-variant.dto";
import { UpdatePriceDto } from "./dto/update-price.dto";

@Controller("products")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles("owner", "manager")
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  // Exposes cost prices — never available to cashiers (POS uses GET /sales/pos-catalog instead).
  @Get()
  @Roles("owner", "manager", "inventory_clerk", "accountant")
  findAll() {
    return this.productsService.findAll();
  }

  @Get(":id")
  @Roles("owner", "manager", "inventory_clerk", "accountant")
  findOne(@Param("id") id: string) {
    return this.productsService.findOne(id);
  }

  @Post(":id/variants")
  @Roles("owner", "manager", "inventory_clerk")
  addVariant(@Param("id") id: string, @Body() dto: CreateVariantDto) {
    return this.productsService.addVariant(id, dto);
  }

  @Get(":id/variants")
  @Roles("owner", "manager", "inventory_clerk", "accountant")
  listVariants(@Param("id") id: string) {
    return this.productsService.listVariants(id);
  }

  @Post(":id/price")
  @Roles("owner", "manager")
  updatePrice(
    @Param("id") id: string,
    @Body() dto: UpdatePriceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.updatePrice(id, dto, user.userId);
  }

  @Get(":id/price-history")
  @Roles("owner", "manager", "inventory_clerk", "accountant")
  getPriceHistory(@Param("id") id: string) {
    return this.productsService.getPriceHistory(id);
  }
}
