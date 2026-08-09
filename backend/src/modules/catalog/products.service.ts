import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { InventoryService } from "../inventory/inventory.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateVariantDto } from "./dto/create-variant.dto";
import { QuickAddProductDto } from "./dto/quick-add-product.dto";
import { UpdatePriceDto } from "./dto/update-price.dto";

/** Hard ceiling on one quick-add transaction — see QuickAddProductDto array caps. */
const MAX_QUICK_ADD_VARIANTS = 200;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
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

  async updateProduct(id: string, dto: Prisma.ProductUncheckedUpdateInput) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: dto,
      include: { category: true, gender: true, productType: true },
    });
  }

  async updateVariant(variantId: string, dto: Prisma.ProductVariantUncheckedUpdateInput) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException(`Variant ${variantId} not found`);

    if (dto.barcode && dto.barcode !== variant.barcode) {
      const clash = await this.prisma.productVariant.findUnique({
        where: { barcode: dto.barcode as string },
      });
      if (clash) throw new ConflictException(`Barcode ${dto.barcode} is already in use`);
    }

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: dto,
      include: { sizeValue: true, color: true },
    });
  }

  /**
   * How much history a record carries. Anything referenced by a sale, a stock movement or
   * a purchase order cannot be destroyed without corrupting past reports, so it is
   * deactivated instead — the row survives, it just stops appearing in pickers.
   */
  private async productUsage(productId: string) {
    const variantIds = (
      await this.prisma.productVariant.findMany({
        where: { productId },
        select: { id: true },
      })
    ).map((v) => v.id);

    if (variantIds.length === 0) return { salesLines: 0, ledgerEntries: 0, poLines: 0, variantIds };

    const [salesLines, ledgerEntries, poLines] = await Promise.all([
      this.prisma.salesOrderLine.count({ where: { variantId: { in: variantIds } } }),
      this.prisma.stockLedgerEntry.count({ where: { variantId: { in: variantIds } } }),
      this.prisma.purchaseOrderLine.count({ where: { variantId: { in: variantIds } } }),
    ]);
    return { salesLines, ledgerEntries, poLines, variantIds };
  }

  /** Read-only preview so the UI can warn before the owner commits. */
  async getDeletionImpact(productId: string) {
    const product = await this.findOne(productId);
    const usage = await this.productUsage(productId);
    const hasHistory = usage.salesLines > 0 || usage.ledgerEntries > 0 || usage.poLines > 0;
    return {
      productId,
      modelName: product.modelName,
      variantCount: usage.variantIds.length,
      salesLines: usage.salesLines,
      stockLedgerEntries: usage.ledgerEntries,
      purchaseOrderLines: usage.poLines,
      canHardDelete: !hasHistory,
      // Spelled out so the UI can say exactly why, rather than "cannot delete".
      reason: hasHistory
        ? "This product appears in past sales, stock movements or purchase orders. Deleting it would break those records, so it will be deactivated and hidden from the catalog instead."
        : "This product has no history, so it will be permanently deleted.",
    };
  }

  /**
   * Destroys the product when nothing references it; otherwise deactivates it (and its
   * variants) so historical documents keep resolving. Returns which of the two happened.
   */
  async deleteProduct(productId: string, performedById: string) {
    const product = await this.findOne(productId);
    const usage = await this.productUsage(productId);
    const hasHistory = usage.salesLines > 0 || usage.ledgerEntries > 0 || usage.poLines > 0;

    if (hasHistory) {
      await this.prisma.$transaction([
        this.prisma.productVariant.updateMany({
          where: { productId },
          data: { isActive: false },
        }),
        this.prisma.product.update({ where: { id: productId }, data: { isActive: false } }),
      ]);
    } else {
      await this.prisma.$transaction([
        this.prisma.productVariant.deleteMany({ where: { productId } }),
        this.prisma.product.delete({ where: { id: productId } }),
      ]);
    }

    await this.audit.record({
      entityType: "product",
      entityId: productId,
      action: "delete",
      performedById,
      before: { modelName: product.modelName, variantCount: usage.variantIds.length },
      after: { mode: hasHistory ? "deactivated" : "deleted", ...usage, variantIds: undefined },
    });

    return {
      productId,
      mode: hasHistory ? ("deactivated" as const) : ("deleted" as const),
      modelName: product.modelName,
    };
  }

  async deleteVariant(variantId: string, performedById: string) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException(`Variant ${variantId} not found`);

    const [salesLines, ledgerEntries, poLines] = await Promise.all([
      this.prisma.salesOrderLine.count({ where: { variantId } }),
      this.prisma.stockLedgerEntry.count({ where: { variantId } }),
      this.prisma.purchaseOrderLine.count({ where: { variantId } }),
    ]);
    const hasHistory = salesLines > 0 || ledgerEntries > 0 || poLines > 0;

    if (hasHistory) {
      await this.prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
    } else {
      await this.prisma.productVariant.delete({ where: { id: variantId } });
    }

    await this.audit.record({
      entityType: "product_variant",
      entityId: variantId,
      action: "delete",
      performedById,
      after: { mode: hasHistory ? "deactivated" : "deleted", salesLines, ledgerEntries, poLines },
    });

    return { variantId, mode: hasHistory ? ("deactivated" as const) : ("deleted" as const) };
  }

  listVariants(productId: string) {
    return this.prisma.productVariant.findMany({
      where: { productId },
      include: { sizeValue: true, color: true },
    });
  }

  /** Batch-safe barcode allocation: unique within the batch AND against what's already stored. */
  private async allocateBarcodes(count: number): Promise<string[]> {
    const codes = new Set<string>();
    for (let attempt = 0; attempt < 10 && codes.size < count; attempt++) {
      while (codes.size < count) codes.add(this.generateBarcode());
      const taken = await this.prisma.productVariant.findMany({
        where: { barcode: { in: Array.from(codes) } },
        select: { barcode: true },
      });
      for (const row of taken) codes.delete(row.barcode);
    }
    if (codes.size < count) {
      throw new ConflictException("Could not allocate unique barcodes — please retry");
    }
    return Array.from(codes);
  }

  private skuToken(value: string, max = 8): string {
    return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, max) || "X";
  }

  /**
   * FR-CAT-1/2/4 + FR-INV-2 in one call: creates the product, every size×color variant,
   * and the opening `receipt` stock entries — all inside a single transaction, so a
   * failure part-way leaves no half-built product behind. Stock is posted through
   * InventoryService.postStockMovement like every other writer (never a direct ledger
   * insert), so movement status and stock-on-hand stay derivable as usual.
   */
  async quickAdd(dto: QuickAddProductDto, performedById: string) {
    const sizeValueIds = Array.from(new Set(dto.sizeValueIds));
    const colorIds = Array.from(new Set(dto.colorIds));
    const variantCount = sizeValueIds.length * colorIds.length;

    if (variantCount > MAX_QUICK_ADD_VARIANTS) {
      throw new BadRequestException(
        `That combination would create ${variantCount} variants (limit ${MAX_QUICK_ADD_VARIANTS}). Reduce the sizes or colors selected.`,
      );
    }

    // Validate FKs up front so the client gets a readable message instead of a raw FK violation.
    const [store, sizes, colors] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: dto.storeId } }),
      this.prisma.sizeValue.findMany({ where: { id: { in: sizeValueIds } } }),
      this.prisma.color.findMany({ where: { id: { in: colorIds } } }),
    ]);
    if (!store) throw new NotFoundException(`Store ${dto.storeId} not found`);
    if (sizes.length !== sizeValueIds.length) {
      throw new BadRequestException("One or more selected sizes no longer exist");
    }
    if (colors.length !== colorIds.length) {
      throw new BadRequestException("One or more selected colors no longer exist");
    }

    const sizeById = new Map(sizes.map((s) => [s.id, s]));
    const colorById = new Map(colors.map((c) => [c.id, c]));

    const defaultQty = dto.openingQuantity ?? 0;
    const overrides = new Map(
      (dto.variantQuantities ?? []).map((v) => [`${v.sizeValueId}:${v.colorId}`, v.quantity]),
    );

    const barcodes = await this.allocateBarcodes(variantCount);

    // SKUs are informational, so a collision must never fail the whole add — dedupe
    // against what's stored and against the batch, suffixing until unique.
    const skuPrefix = this.skuToken(dto.brand ?? dto.modelName);
    const candidateSkus = new Set<string>();
    const existingSkus = new Set(
      (
        await this.prisma.productVariant.findMany({
          where: { sku: { startsWith: `${skuPrefix}-` } },
          select: { sku: true },
        })
      ).flatMap((r) => (r.sku ? [r.sku] : [])),
    );
    const uniqueSku = (base: string) => {
      let sku = base;
      let n = 2;
      while (existingSkus.has(sku) || candidateSkus.has(sku)) sku = `${base}-${n++}`;
      candidateSkus.add(sku);
      return sku;
    };

    const plan = sizeValueIds.flatMap((sizeValueId) =>
      colorIds.map((colorId) => {
        const size = sizeById.get(sizeValueId)!;
        const color = colorById.get(colorId)!;
        return {
          sizeValueId,
          colorId,
          sku: uniqueSku(
            `${skuPrefix}-${this.skuToken(dto.modelName, 10)}-${this.skuToken(color.name, 4)}-${this.skuToken(size.value, 4)}`,
          ),
          quantity: overrides.get(`${sizeValueId}:${colorId}`) ?? defaultQty,
        };
      }),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          modelName: dto.modelName,
          categoryId: dto.categoryId,
          genderId: dto.genderId,
          productTypeId: dto.productTypeId,
          brand: dto.brand,
          baseCostPrice: dto.baseCostPrice,
          baseSellingPrice: dto.baseSellingPrice,
          description: dto.description,
          imageUrl: dto.imageUrl,
        },
        include: { category: true, gender: true, productType: true },
      });

      let unitsAdded = 0;
      for (const [index, row] of plan.entries()) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sizeValueId: row.sizeValueId,
            colorId: row.colorId,
            barcode: barcodes[index],
            sku: row.sku,
            reorderPoint: dto.reorderPoint ?? 0,
          },
        });

        if (row.quantity > 0) {
          await this.inventory.postStockMovement(
            {
              storeId: dto.storeId,
              variantId: variant.id,
              entryType: "receipt",
              quantityDelta: row.quantity,
              unitCost: dto.baseCostPrice,
              referenceType: "manual",
              performedById,
            },
            tx,
          );
          unitsAdded += row.quantity;
        }
      }

      return { product, variantCount: plan.length, unitsAdded };
    });

    await this.audit.record({
      entityType: "product",
      entityId: result.product.id,
      action: "create",
      performedById,
      after: {
        modelName: dto.modelName,
        variantCount: result.variantCount,
        unitsAdded: result.unitsAdded,
        storeId: dto.storeId,
      },
    });

    return result;
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
