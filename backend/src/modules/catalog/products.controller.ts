import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { ProductsService } from "./products.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateVariantDto } from "./dto/create-variant.dto";
import { QuickAddProductDto } from "./dto/quick-add-product.dto";
import { UpdateProductDto, UpdateVariantDto } from "./dto/update-product.dto";
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

  /**
   * Product + all size×color variants + opening stock in one transaction.
   * Registered before ":id" routes so "quick-add" isn't captured as an id.
   */
  @Post("quick-add")
  @Roles("owner", "manager", "inventory_clerk")
  quickAdd(@Body() dto: QuickAddProductDto, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.quickAdd(dto, user.userId);
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

  @Patch(":id")
  @Roles("owner", "manager")
  updateProduct(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.updateProduct(id, dto);
  }

  @Patch("variants/:variantId")
  @Roles("owner", "manager", "inventory_clerk")
  updateVariant(@Param("variantId") variantId: string, @Body() dto: UpdateVariantDto) {
    return this.productsService.updateVariant(variantId, dto);
  }

  /** What deleting would actually do — the UI shows this before asking to confirm. */
  @Get(":id/deletion-impact")
  @Roles("owner")
  deletionImpact(@Param("id") id: string) {
    return this.productsService.getDeletionImpact(id);
  }

  // Owner only: destroys the record outright when it has no history.
  @Delete(":id")
  @Roles("owner")
  deleteProduct(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.deleteProduct(id, user.userId);
  }

  @Delete("variants/:variantId")
  @Roles("owner")
  deleteVariant(@Param("variantId") variantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.deleteVariant(variantId, user.userId);
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
