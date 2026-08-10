import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type NamedLookupEntity = "category" | "gender" | "productType" | "dailyExpenseCategory";

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

  /** Active-only, for the expense-entry category picker (every role can read this). */
  findAllExpenseCategories() {
    return this.prisma.dailyExpenseCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  createSize(standard: string, value: string, sortOrder = 0) {
    return this.prisma.sizeValue.create({ data: { standard, value, sortOrder } });
  }

  // ------------------------------------------------------------ edit / delete

  rename(entity: NamedLookupEntity, id: string, name?: string, isActive?: boolean) {
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (isActive !== undefined) data.isActive = isActive;
    return this.delegate(entity).update({ where: { id }, data });
  }

  updateColor(id: string, data: { name?: string; hexCode?: string }) {
    return this.prisma.color.update({ where: { id }, data });
  }

  updateSize(id: string, data: { standard?: string; value?: string; sortOrder?: number }) {
    return this.prisma.sizeValue.update({ where: { id }, data });
  }

  /**
   * How many products/variants point at a lookup value. Unlike products, these tables have
   * no `isActive` flag to fall back on, so an in-use value simply cannot be removed —
   * deleting it would leave products pointing at nothing. The count is returned so the
   * caller can say how many records are in the way rather than just refusing.
   */
  private async usageCount(kind: string, id: string): Promise<number> {
    switch (kind) {
      case "category":
        return this.prisma.product.count({ where: { categoryId: id } });
      case "gender":
        return this.prisma.product.count({ where: { genderId: id } });
      case "productType":
        return this.prisma.product.count({ where: { productTypeId: id } });
      case "color":
        return this.prisma.productVariant.count({ where: { colorId: id } });
      case "size":
        return this.prisma.productVariant.count({ where: { sizeValueId: id } });
      case "dailyExpenseCategory":
        return this.prisma.dailyExpense.count({ where: { categoryId: id, deletedAt: null } });
      default:
        return 0;
    }
  }

  async getUsage(kind: string, id: string) {
    const inUseBy = await this.usageCount(kind, id);
    return { id, kind, inUseBy, canDelete: inUseBy === 0 };
  }

  async remove(kind: string, id: string) {
    const inUseBy = await this.usageCount(kind, id);
    if (inUseBy > 0) {
      const noun = kind === "dailyExpenseCategory" ? "expense(s)" : "product(s)";
      throw new ConflictException(
        `This value is used by ${inUseBy} ${noun} and cannot be deleted. Reassign them first, or retire this value instead.`,
      );
    }

    switch (kind) {
      case "color":
        await this.prisma.color.delete({ where: { id } });
        break;
      case "size":
        await this.prisma.sizeValue.delete({ where: { id } });
        break;
      default:
        await this.delegate(kind as NamedLookupEntity).delete({ where: { id } });
    }
    return { id, kind, deleted: true };
  }
}
