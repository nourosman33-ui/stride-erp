import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type NamedLookupEntity = "category" | "gender" | "productType";

/**
 * CRUD over the controlled-vocabulary lookup tables (FR-CAT-3) that replace
 * the source workbook's free-text Category/Gender/Product Type columns.
 * Delegates are looked up dynamically since all three models share the
 * same {id, name} shape; this trades static typing for avoiding three
 * near-identical services.
 */
@Injectable()
export class LookupsService {
  constructor(private readonly prisma: PrismaService) {}

  private delegate(entity: NamedLookupEntity) {
    return (this.prisma as unknown as Record<string, any>)[entity];
  }

  findAll(entity: NamedLookupEntity) {
    return this.delegate(entity).findMany({ orderBy: { name: "asc" } });
  }

  create(entity: NamedLookupEntity, name: string) {
    return this.delegate(entity).create({ data: { name } });
  }

  findAllColors() {
    return this.prisma.color.findMany({ orderBy: { name: "asc" } });
  }

  createColor(name: string, hexCode?: string) {
    return this.prisma.color.create({ data: { name, hexCode } });
  }

  findAllSizes() {
    return this.prisma.sizeValue.findMany({
      orderBy: [{ standard: "asc" }, { sortOrder: "asc" }],
    });
  }

  createSize(standard: string, value: string, sortOrder = 0) {
    return this.prisma.sizeValue.create({ data: { standard, value, sortOrder } });
  }
}
