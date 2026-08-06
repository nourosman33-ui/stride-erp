import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { LookupsService } from "./lookups.service";
import { CreateNamedLookupDto } from "./dto/create-named-lookup.dto";
import { CreateColorDto } from "./dto/create-color.dto";
import { CreateSizeDto } from "./dto/create-size.dto";

@Controller("catalog")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get("categories")
  listCategories() {
    return this.lookups.findAll("category");
  }

  @Post("categories")
  @Roles("owner", "manager")
  createCategory(@Body() dto: CreateNamedLookupDto) {
    return this.lookups.create("category", dto.name);
  }

  @Get("genders")
  listGenders() {
    return this.lookups.findAll("gender");
  }

  @Post("genders")
  @Roles("owner", "manager")
  createGender(@Body() dto: CreateNamedLookupDto) {
    return this.lookups.create("gender", dto.name);
  }

  @Get("product-types")
  listProductTypes() {
    return this.lookups.findAll("productType");
  }

  @Post("product-types")
  @Roles("owner", "manager")
  createProductType(@Body() dto: CreateNamedLookupDto) {
    return this.lookups.create("productType", dto.name);
  }

  @Get("colors")
  listColors() {
    return this.lookups.findAllColors();
  }

  @Post("colors")
  @Roles("owner", "manager")
  createColor(@Body() dto: CreateColorDto) {
    return this.lookups.createColor(dto.name, dto.hexCode);
  }

  @Get("sizes")
  listSizes() {
    return this.lookups.findAllSizes();
  }

  @Post("sizes")
  @Roles("owner", "manager")
  createSize(@Body() dto: CreateSizeDto) {
    return this.lookups.createSize(dto.standard, dto.value, dto.sortOrder);
  }
}
