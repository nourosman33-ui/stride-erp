import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
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

  // Predefined + owner/manager-addable categories for the Daily Expenses feature.
  // Every role can read (cashiers need the picker); only owner/manager can add.
  @Get("expense-categories")
  listExpenseCategories() {
    return this.lookups.findAllExpenseCategories();
  }

  @Post("expense-categories")
  @Roles("owner", "manager")
  createExpenseCategory(@Body() dto: CreateNamedLookupDto) {
    return this.lookups.create("dailyExpenseCategory", dto.name);
  }

  // ---------------------------------------------------------- edit / delete
  //
  // One generic pair rather than ten near-identical routes. `kind` is validated
  // against a fixed allow-list so it can never be used to reach another table.

  private static readonly KINDS = [
    "category",
    "gender",
    "productType",
    "color",
    "size",
    "dailyExpenseCategory",
  ] as const;

  private assertKind(kind: string) {
    if (!(LookupsController.KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException(`Unknown catalog type "${kind}"`);
    }
    return kind;
  }

  /** Whether this value can be removed, and how many products block it if not. */
  @Get(":kind/:id/usage")
  @Roles("owner", "manager")
  usage(@Param("kind") kind: string, @Param("id") id: string) {
    return this.lookups.getUsage(this.assertKind(kind), id);
  }

  @Patch(":kind/:id")
  @Roles("owner", "manager")
  update(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      hexCode?: string;
      standard?: string;
      value?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    switch (this.assertKind(kind)) {
      case "color":
        return this.lookups.updateColor(id, { name: body.name, hexCode: body.hexCode });
      case "size":
        return this.lookups.updateSize(id, {
          standard: body.standard,
          value: body.value,
          sortOrder: body.sortOrder,
        });
      default: {
        const name = body.name?.trim();
        if (name === undefined && body.isActive === undefined) {
          throw new BadRequestException("Nothing to update");
        }
        if (body.name !== undefined && !name) throw new BadRequestException("A name is required");
        return this.lookups.rename(kind as never, id, name, body.isActive);
      }
    }
  }

  // Owner only: refused outright when any product still points at the value.
  @Delete(":kind/:id")
  @Roles("owner")
  remove(@Param("kind") kind: string, @Param("id") id: string) {
    return this.lookups.remove(this.assertKind(kind), id);
  }
}
