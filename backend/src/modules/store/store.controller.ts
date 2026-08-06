import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { StoreService } from "./store.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";

@Controller("stores")
@UseGuards(JwtAuthGuard, RolesGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post()
  @Roles("owner")
  create(@Body() dto: CreateStoreDto, @CurrentUser() user: AuthenticatedUser) {
    return this.storeService.create(dto, user.userId);
  }

  @Get()
  findAll() {
    return this.storeService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.storeService.findOne(id);
  }

  @Patch(":id")
  @Roles("owner", "manager")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateStoreDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storeService.update(id, dto, user.userId);
  }
}
