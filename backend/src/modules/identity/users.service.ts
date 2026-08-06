import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, performedById: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("A user with this email already exists");
    }

    const roles = await this.prisma.role.findMany({
      where: { name: { in: dto.roleNames } },
    });
    if (roles.length !== dto.roleNames.length) {
      const found = roles.map((r) => r.name);
      const missing = dto.roleNames.filter((name) => !found.includes(name));
      throw new NotFoundException(`Unknown role(s): ${missing.join(", ")}`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        userRoles: {
          create: roles.map((role) => ({ roleId: role.id, storeId: dto.storeId ?? null })),
        },
      },
      include: { userRoles: { include: { role: true } } },
    });

    await this.audit.record({
      entityType: "user",
      entityId: user.id,
      action: "create",
      performedById,
      after: { email: user.email, fullName: user.fullName, roles: dto.roleNames },
    });

    return this.sanitize(user);
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: { userRoles: { include: { role: true } } },
      orderBy: { createdAt: "desc" },
    });
    return users.map((u) => this.sanitize(u));
  }

  private sanitize<T extends { passwordHash: string }>(user: T) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
