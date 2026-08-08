import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type PrismaTx = Prisma.TransactionClient;
import { AuditService } from "../../common/audit/audit.service";
import { InventoryService } from "../inventory/inventory.service";
import { CustomersService } from "../customers/customers.service";
import { CreateSaleDto } from "./dto/create-sale.dto";

// Sub-cent rounding slack when comparing SUM(payments) to grand_total (FR-SAL-3).
const MONEY_EPSILON = 0.01;

// Receipts/invoice history are cashier-readable (GET /sales has no @Roles restriction), so the
// nested variant/product here is a `select`, not `include: true` — it must never surface
// costPriceOverride/baseCostPrice the way the full catalog endpoints do for back-office roles.
const ORDER_INCLUDE = {
  lines: {
    include: {
      variant: {
        select: {
          id: true,
          productId: true,
          sizeValueId: true,
          colorId: true,
          barcode: true,
          sellingPriceOverride: true,
          reorderPoint: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          product: {
            select: {
              id: true,
              modelName: true,
              categoryId: true,
              genderId: true,
              productTypeId: true,
              brand: true,
              baseSellingPrice: true,
              description: true,
              imageUrl: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          sizeValue: true,
          color: true,
        },
      },
    },
  },
  payments: true,
  customer: true,
  cashier: { select: { id: true, fullName: true } },
  store: true,
} as const;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly customers: CustomersService,
  ) {}

  /**
   * FR-SAL-1/2/3 + FR-INV-2: the checkout transaction. Prices are resolved
   * server-side from the variant/product (never trusted from the client),
   * stock is re-checked inside the transaction immediately before each
   * deduction, and every line posts a `sale` stock_ledger_entry through
   * InventoryService — Sales never writes the ledger directly, the same
   * choke-point rule Purchasing follows (see InventoryService header comment).
   * A sale is never half-posted: order, lines, payments and stock deduction
   * all commit or roll back together.
   */
  async checkout(dto: CreateSaleDto, cashierId: string) {
    const order = await this.prisma.$transaction((tx) => this.checkoutInTx(dto, cashierId, tx));

    await this.audit.record({
      entityType: "sales_order",
      entityId: order.id,
      action: "create",
      performedById: cashierId,
      after: {
        invoiceNumber: order.invoiceNumber,
        grandTotal: Number(order.grandTotal),
        lineCount: order.lines.length,
      },
    });

    return { ...order, loyaltySnapshot: await this.loyaltySnapshot(order.customerId, dto.storeId) };
  }

  /**
   * Loyalty figures for the receipt ("Current Points" / "Current Tier") — computed fresh
   * post-commit rather than tracked incrementally, the same derive-don't-cache approach
   * used for stock-on-hand.
   */
  private async loyaltySnapshot(customerId: string | null, storeId: string) {
    if (!customerId) return null;
    const [pointsBalance, stats] = await Promise.all([
      this.customers.getPointsBalance(customerId),
      this.customers.computeStats(customerId),
    ]);
    const tier = await this.customers.computeTier(storeId, stats.lifetimeSpending);
    return { pointsBalance, tier };
  }

  /**
   * The whole sale, executed against a caller-supplied transaction client.
   * Exposed so ReturnsService can raise an exchange's replacement order inside the *same*
   * transaction as the return itself — otherwise a failure between the two would leave
   * goods returned with nothing sold back, or vice versa. Reads go through `tx` too, so
   * the stock check sees any restock the return has already posted in that transaction.
   */
  async checkoutInTx(dto: CreateSaleDto, cashierId: string, tx: PrismaTx) {
    const store = await tx.store.findUnique({ where: { id: dto.storeId } });
    if (!store) {
      throw new NotFoundException(`Store ${dto.storeId} not found`);
    }

    if (dto.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: dto.customerId } });
      if (!customer) {
        throw new NotFoundException(`Customer ${dto.customerId} not found`);
      }
    }

    const redeemPoints = dto.redeemPoints ?? 0;
    if (redeemPoints > 0 && !dto.customerId && !dto.newCustomer) {
      throw new BadRequestException("Redeeming loyalty points requires a customer on the sale");
    }

    const variants = await tx.productVariant.findMany({
      where: { id: { in: dto.lines.map((l) => l.variantId) } },
      include: { product: true },
    });
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    const vatRate = Number(store.vatRate);
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    const lineData = dto.lines.map((line) => {
      const variant = variantMap.get(line.variantId);
      if (!variant || !variant.isActive) {
        throw new BadRequestException(`Variant ${line.variantId} not found or inactive`);
      }

      const unitPrice = Number(variant.sellingPriceOverride ?? variant.product.baseSellingPrice);
      const discountAmount = line.discountAmount ?? 0;
      if (discountAmount > unitPrice) {
        throw new BadRequestException(
          `Discount for ${variant.product.modelName} cannot exceed its unit price`,
        );
      }

      const netPrice = Number(((unitPrice - discountAmount) * line.quantity).toFixed(2));
      const taxAmount = Number((netPrice * (vatRate / 100)).toFixed(2));

      subtotal += unitPrice * line.quantity;
      discountTotal += discountAmount * line.quantity;
      taxTotal += taxAmount;

      return {
        variantId: line.variantId,
        quantity: line.quantity,
        unitPrice,
        discountAmount,
        netPrice,
        taxAmount,
        productName: variant.product.modelName,
      };
    });

    subtotal = Number(subtotal.toFixed(2));
    discountTotal = Number(discountTotal.toFixed(2));
    taxTotal = Number(taxTotal.toFixed(2));
    const grandTotal = Number((subtotal - discountTotal + taxTotal).toFixed(2));

    // Redeemed points act as a payment source paid in points instead of cash/card — the
    // recorded Payment rows only need to cover what's left after redemption.
    const redemptionValue = Number(
      (redeemPoints * Number(store.loyaltyPointValue ?? 1)).toFixed(2),
    );
    if (redemptionValue > grandTotal) {
      throw new BadRequestException(
        `Redemption value (${redemptionValue}) cannot exceed the invoice total (${grandTotal})`,
      );
    }
    const netPayable = Number((grandTotal - redemptionValue).toFixed(2));

    const paymentTotal = Number(dto.payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2));
    if (Math.abs(paymentTotal - netPayable) > MONEY_EPSILON) {
      throw new BadRequestException(
        `Payment total (${paymentTotal}) plus redeemed points value (${redemptionValue}) does not equal the invoice total (${grandTotal})`,
      );
    }

    const cashPortion = dto.payments
      .filter((p) => p.method === "cash")
      .reduce((sum, p) => sum + p.amount, 0);
    const changeDue =
      dto.amountTendered !== undefined
        ? Number(Math.max(0, dto.amountTendered - cashPortion).toFixed(2))
        : 0;

    // Create-inline-at-checkout: a phone lookup during POS found no match.
    let customerId = dto.customerId;
    if (!customerId && dto.newCustomer) {
      const createdCustomer = await tx.customer.create({
        data: { name: dto.newCustomer.name, phone: dto.newCustomer.phone },
      });
      customerId = createdCustomer.id;
    }

    let pointsEarned = 0;
    if (customerId) {
      if (redeemPoints > 0) {
        // tx-scoped balance check — a customer created earlier in this same transaction
        // isn't visible to CustomersService's separate connection until commit.
        const balanceAgg = await tx.loyaltyTransaction.aggregate({
          where: { customerId },
          _sum: { pointsDelta: true },
        });
        const balance = balanceAgg._sum.pointsDelta ?? 0;
        if (balance < redeemPoints) {
          throw new BadRequestException(
            `Customer has ${balance} points, cannot redeem ${redeemPoints}`,
          );
        }
      }
      // No points earned on the portion paid *with* points — avoids an earn/redeem loop.
      pointsEarned = Math.floor(netPayable * Number(store.loyaltyPointsPerCurrency ?? 0));
    }

    for (const line of lineData) {
      const onHand = await this.inventory.getStockOnHand(dto.storeId, line.variantId, tx);
      if (onHand < line.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${line.productName} (${onHand} on hand, ${line.quantity} requested)`,
        );
      }
    }

    // Atomic per-store sequence — see Store.invoiceSeq comment in schema.prisma.
    const seqStore = await tx.store.update({
      where: { id: dto.storeId },
      data: { invoiceSeq: { increment: 1 } },
      select: { invoiceSeq: true },
    });
    const invoiceNumber = `INV-${dto.storeId.slice(0, 8).toUpperCase()}-${String(
      seqStore.invoiceSeq,
    ).padStart(6, "0")}`;

    const created = await tx.salesOrder.create({
      data: {
        storeId: dto.storeId,
        invoiceNumber,
        customerId,
        cashierId,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        pointsEarned,
        pointsRedeemed: redeemPoints,
        amountTendered: dto.amountTendered,
        changeDue,
        status: "completed",
        lines: {
          create: lineData.map(({ productName: _productName, ...line }) => line),
        },
        payments: {
          create: dto.payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            referenceNo: p.referenceNo,
          })),
        },
      },
      include: ORDER_INCLUDE,
    });

    for (const line of created.lines) {
      await this.inventory.postStockMovement(
        {
          storeId: dto.storeId,
          variantId: line.variantId,
          entryType: "sale",
          quantityDelta: -line.quantity,
          referenceType: "sales_order",
          referenceId: created.id,
          performedById: cashierId,
        },
        tx,
      );
    }

    if (customerId) {
      if (pointsEarned > 0) {
        await tx.loyaltyTransaction.create({
          data: {
            customerId,
            storeId: dto.storeId,
            type: "earn",
            pointsDelta: pointsEarned,
            referenceType: "sales_order",
            referenceId: created.id,
            performedById: cashierId,
          },
        });
      }
      if (redeemPoints > 0) {
        await tx.loyaltyTransaction.create({
          data: {
            customerId,
            storeId: dto.storeId,
            type: "redeem",
            pointsDelta: -redeemPoints,
            referenceType: "sales_order",
            referenceId: created.id,
            performedById: cashierId,
          },
        });
      }
    }

    return created;
  }

  /**
   * Flattened, cashier-safe sellable-items view for the POS UI: name/size/color/barcode,
   * selling price, and on-hand quantity — never cost. Lets the POS page (and the cashier
   * role) avoid the cost-bearing catalog/inventory endpoints entirely, rather than trusting
   * the frontend to hide fields that the API already handed over.
   */
  async getPosCatalog(storeId: string) {
    const [variants, quantities] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { isActive: true, product: { isActive: true } },
        include: { product: { include: { category: true } }, sizeValue: true, color: true },
      }),
      this.inventory.listQuantitiesOnHand(storeId),
    ]);

    return variants.map((v) => ({
      variantId: v.id,
      productId: v.productId,
      productName: v.product.modelName,
      imageUrl: v.product.imageUrl,
      categoryId: v.product.categoryId,
      categoryName: v.product.category.name,
      barcode: v.barcode,
      sizeLabel: `${v.sizeValue.standard} ${v.sizeValue.value}`,
      colorName: v.color.name,
      sellingPrice: Number(v.sellingPriceOverride ?? v.product.baseSellingPrice),
      quantityOnHand: quantities.get(v.id) ?? 0,
    }));
  }

  findAll(storeId?: string) {
    return this.prisma.salesOrder.findMany({
      where: storeId ? { storeId } : undefined,
      include: ORDER_INCLUDE,
      orderBy: { orderDate: "desc" },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException(`Sales order ${id} not found`);
    }
    return order;
  }
}
