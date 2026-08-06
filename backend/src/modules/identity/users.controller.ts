import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles("owner", "manager")
  create(@Body() dto: CreateUserDto, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.usersService.create(dto, currentUser.userId);
  }

  @Get()
  @Roles("owner", "manager")
  findAll() {
    return this.usersService.findAll();
  }
}
