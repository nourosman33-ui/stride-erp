import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateStoreDto, performedById: string) {
    const store = await this.prisma.store.create({
      data: {
        ...dto,
        openingDate: dto.openingDate ? new Date(dto.openingDate) : undefined,
        movementStatusRule: { create: {} }, // seed defaults (70% / 10%) per FR-INV-3
      },
    });

    await this.audit.record({
      entityType: "store",
      entityId: store.id,
      action: "create",
      performedById,
      after: dto as unknown as Record<string, unknown>,
    });

    return store;
  }

  findAll() {
    return this.prisma.store.findMany({ where: { isActive: true } });
  }

  async findOne(id: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) {
      throw new NotFoundException(`Store ${id} not found`);
    }
    return store;
  }

  async update(id: string, dto: UpdateStoreDto, performedById: string) {
    const before = await this.findOne(id);

    const store = await this.prisma.store.update({
      where: { id },
      data: {
        ...dto,
        openingDate: dto.openingDate ? new Date(dto.openingDate) : undefined,
      },
    });

    await this.audit.record({
      entityType: "store",
      entityId: store.id,
      action: "update",
      performedById,
      before: before as unknown as Record<string, unknown>,
      after: store as unknown as Record<string, unknown>,
    });

    return store;
  }
}
