import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateVariantDto } from "./dto/create-variant.dto";
import { UpdatePriceDto } from "./dto/update-price.dto";

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: dto,
      include: { category: true, gender: true, productType: true },
    });
  }

  findAll() {
    return this.prisma.product.findMany({
      where: { isActive: true },
      include: { category: true, gender: true, productType: true, variants: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        gender: true,
        productType: true,
        variants: { include: { sizeValue: true, color: true } },
      },
    });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  /**
   * 12-digit numeric placeholder barcode (FR-CAT-4). A real EAN-13 checksum
   * digit and/or GS1 prefix registration is a pre-launch operational task,
   * not a schema/architecture concern — uniqueness is what's enforced here.
   */
  private generateBarcode(): string {
    return Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
  }

  async addVariant(productId: string, dto: CreateVariantDto) {
    await this.findOne(productId);

    const barcode = dto.barcode ?? this.generateBarcode();
    const existingBarcode = await this.prisma.productVariant.findUnique({
      where: { barcode },
    });
    if (existingBarcode) {
      throw new ConflictException(`Barcode ${barcode} is already in use`);
    }

    const existingCombo = await this.prisma.productVariant.findUnique({
      where: {
        productId_sizeValueId_colorId: {
          productId,
          sizeValueId: dto.sizeValueId,
          colorId: dto.colorId,
        },
      },
    });
    if (existingCombo) {
      throw new ConflictException(
        "This product already has a variant with that size/color combination",
      );
    }

    return this.prisma.productVariant.create({
      data: {
        productId,
        sizeValueId: dto.sizeValueId,
        colorId: dto.colorId,
        barcode,
        reorderPoint: dto.reorderPoint ?? 0,
      },
      include: { sizeValue: true, color: true },
    });
  }

  listVariants(productId: string) {
    return this.prisma.productVariant.findMany({
      where: { productId },
      include: { sizeValue: true, color: true },
    });
  }

  /** Changes a live price and preserves the prior value in price_history (FR-CAT-5). */
  async updatePrice(productId: string, dto: UpdatePriceDto, performedById: string) {
    const product = await this.findOne(productId);

    if (dto.variantId) {
      const variant = product.variants.find((v) => v.id === dto.variantId);
      if (!variant) {
        throw new NotFoundException(`Variant ${dto.variantId} not found on this product`);
      }

      const oldValue =
        dto.field === "cost_price" ? variant.costPriceOverride : variant.sellingPriceOverride;

      const [, history] = await this.prisma.$transaction([
        this.prisma.productVariant.update({
          where: { id: dto.variantId },
          data:
            dto.field === "cost_price"
              ? { costPriceOverride: dto.newValue }
              : { sellingPriceOverride: dto.newValue },
        }),
        this.prisma.priceHistory.create({
          data: {
            productId,
            variantId: dto.variantId,
            field: dto.field,
            oldValue: oldValue ?? undefined,
            newValue: dto.newValue,
            changedById: performedById,
            reason: dto.reason,
          },
        }),
      ]);

      await this.audit.record({
        entityType: "product_variant",
        entityId: dto.variantId,
        action: "update",
        performedById,
        before: { [dto.field]: oldValue },
        after: { [dto.field]: dto.newValue },
      });

      return history;
    }

    const oldValue = dto.field === "cost_price" ? product.baseCostPrice : product.baseSellingPrice;

    const [, history] = await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id: productId },
        data:
          dto.field === "cost_price"
            ? { baseCostPrice: dto.newValue }
            : { baseSellingPrice: dto.newValue },
      }),
      this.prisma.priceHistory.create({
        data: {
          productId,
          field: dto.field,
          oldValue: oldValue ?? undefined,
          newValue: dto.newValue,
          changedById: performedById,
          reason: dto.reason,
        },
      }),
    ]);

    await this.audit.record({
      entityType: "product",
      entityId: productId,
      action: "update",
      performedById,
      before: { [dto.field]: oldValue },
      after: { [dto.field]: dto.newValue },
    });

    return history;
  }

  getPriceHistory(productId: string) {
    return this.prisma.priceHistory.findMany({
      where: { productId },
      orderBy: { effectiveAt: "desc" },
      include: { changedBy: { select: { id: true, fullName: true } } },
    });
  }
}
