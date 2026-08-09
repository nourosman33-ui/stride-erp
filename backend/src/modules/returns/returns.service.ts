import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { InventoryService } from "../inventory/inventory.service";
import { CustomersService } from "../customers/customers.service";
import { SalesService } from "../sales/sales.service";
import { CreateReturnDto } from "./dto/create-return.dto";

type PrismaTx = Prisma.TransactionClient;

/** Roles allowed to accept a return after the store's return window has closed. */
const WINDOW_OVERRIDE_ROLES = ["owner", "manager"];

const RETURN_INCLUDE = {
  lines: {
    include: {
      variant: {
        select: {
          id: true,
          barcode: true,
          sku: true,
          product: { select: { id: true, modelName: true, brand: true, imageUrl: true } },
          sizeValue: true,
          color: true,
        },
      },
    },
  },
  originalOrder: { select: { id: true, invoiceNumber: true, orderDate: true, status: true } },
  // Full line detail (not just totals) so the return receipt can show exactly what the
  // customer walked out with on an exchange, the same way a normal sale receipt does.
  exchangeOrder: {
    select: {
      id: true,
      invoiceNumber: true,
      orderDate: true,
      grandTotal: true,
      amountTendered: true,
      changeDue: true,
      payments: true,
      lines: {
        include: {
          variant: {
            select: {
              id: true,
              barcode: true,
              product: { select: { id: true, modelName: true, brand: true, imageUrl: true } },
              sizeValue: true,
              color: true,
            },
          },
        },
      },
    },
  },
  customer: true,
  processedBy: { select: { id: true, fullName: true } },
  store: true,
} as const;

function money(value: number): number {
  const rounded = Number(value.toFixed(2));
  return Object.is(rounded, -0) ? 0 : rounded;
}

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly customers: CustomersService,
    private readonly sales: SalesService,
  ) {}

  /**
   * What is still returnable on an order — the POS returns screen calls this before
   * letting a cashier pick lines. Returned quantities are derived by summing
   * SalesReturnLine, never stored on the order line, so a return can never disagree
   * with the returns that actually exist (same principle as stock-on-hand).
   */
  async getEligibility(orderId: string) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: {
        store: { select: { returnPeriodDays: true, currency: true } },
        customer: true,
        lines: {
          include: {
            variant: {
              select: {
                id: true,
                barcode: true,
                product: { select: { modelName: true, brand: true, imageUrl: true } },
                sizeValue: true,
                color: true,
              },
            },
            returnLines: { select: { quantity: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException(`Sales order ${orderId} not found`);

    const daysSinceSale = Math.floor(
      (Date.now() - order.orderDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    const returnPeriodDays = order.store.returnPeriodDays;

    return {
      orderId: order.id,
      invoiceNumber: order.invoiceNumber,
      orderDate: order.orderDate,
      status: order.status,
      currency: order.store.currency,
      customer: order.customer,
      grandTotal: order.grandTotal,
      daysSinceSale,
      returnPeriodDays,
      withinReturnWindow: daysSinceSale <= returnPeriodDays,
      isVoided: order.status === "voided",
      lines: order.lines.map((line) => {
        const alreadyReturned = line.returnLines.reduce((sum, r) => sum + r.quantity, 0);
        return {
          orderLineId: line.id,
          variantId: line.variantId,
          productName: line.variant.product.modelName,
          brand: line.variant.product.brand,
          imageUrl: line.variant.product.imageUrl,
          size: line.variant.sizeValue.value,
          color: line.variant.color.name,
          barcode: line.variant.barcode,
          quantitySold: line.quantity,
          quantityReturned: alreadyReturned,
          quantityReturnable: line.quantity - alreadyReturned,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          // Per-unit refund at the price actually paid, tax included.
          refundPerUnit: money(
            Number(line.unitPrice) -
              Number(line.discountAmount) +
              Number(line.taxAmount) / line.quantity,
          ),
        };
      }),
    };
  }

  async createReturn(dto: CreateReturnDto, userId: string, roles: string[]) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id: dto.originalOrderId },
      include: {
        store: true,
        lines: { include: { returnLines: { select: { quantity: true } } } },
      },
    });
    if (!order) throw new NotFoundException(`Sales order ${dto.originalOrderId} not found`);
    if (order.status === "voided") {
      throw new BadRequestException("A voided sale cannot be returned");
    }

    // --- Return window (FR-CFG: Store.returnPeriodDays) -------------------
    const daysSinceSale = Math.floor(
      (Date.now() - order.orderDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (daysSinceSale > order.store.returnPeriodDays) {
      const mayOverride = roles.some((r) => WINDOW_OVERRIDE_ROLES.includes(r));
      if (!dto.overrideReturnWindow || !mayOverride) {
        throw new ForbiddenException(
          `This sale is ${daysSinceSale} days old and the return period is ${order.store.returnPeriodDays} days. A manager or owner must approve it.`,
        );
      }
    }

    // --- Quantity validation against what is actually still returnable ----
    const lineById = new Map(order.lines.map((l) => [l.id, l]));
    const requestedByLine = new Map<string, number>();
    for (const req of dto.lines) {
      requestedByLine.set(req.orderLineId, (requestedByLine.get(req.orderLineId) ?? 0) + req.quantity);
    }

    const vatRate = Number(order.store.vatRate);
    let refundSubtotal = 0;
    let refundTaxTotal = 0;

    const returnLineData = dto.lines.map((req) => {
      const line = lineById.get(req.orderLineId);
      if (!line) {
        throw new BadRequestException(`Line ${req.orderLineId} is not part of this sale`);
      }
      const alreadyReturned = line.returnLines.reduce((sum, r) => sum + r.quantity, 0);
      const requested = requestedByLine.get(req.orderLineId) ?? 0;
      if (alreadyReturned + requested > line.quantity) {
        throw new BadRequestException(
          `Cannot return ${requested} of that item — ${line.quantity} sold, ${alreadyReturned} already returned`,
        );
      }

      const netPerUnit = Number(line.unitPrice) - Number(line.discountAmount);
      const refundNet = money(netPerUnit * req.quantity);
      // Tax refunded proportionally to the quantity coming back.
      const refundTax = money((Number(line.taxAmount) / line.quantity) * req.quantity);

      refundSubtotal += refundNet;
      refundTaxTotal += refundTax;

      return {
        orderLineId: line.id,
        variantId: line.variantId,
        quantity: req.quantity,
        unitPrice: Number(line.unitPrice),
        refundAmount: refundNet,
        taxAmount: refundTax,
        restock: req.restock ?? true,
        condition: req.condition,
      };
    });

    refundSubtotal = money(refundSubtotal);
    refundTaxTotal = money(refundTaxTotal);
    const refundTotal = money(refundSubtotal + refundTaxTotal);

    if (dto.type === "exchange" && (!dto.exchangeLines || dto.exchangeLines.length === 0)) {
      throw new BadRequestException("An exchange needs at least one replacement item");
    }

    // --- Loyalty: claw back what the returned value earned ----------------
    // Proportional to the share of the sale being returned. Redeemed points are handed
    // back in the same proportion, so a customer who paid partly in points is not left
    // out of pocket by returning.
    const orderGrandTotal = Number(order.grandTotal);
    const refundRatio = orderGrandTotal > 0 ? refundTotal / orderGrandTotal : 0;
    const pointsClawedBack = Math.round(order.pointsEarned * refundRatio);
    const pointsRestored = Math.round(order.pointsRedeemed * refundRatio);
    const pointsAdjusted = pointsRestored - pointsClawedBack;

    const result = await this.prisma.$transaction(async (tx) => {
      // Atomic per-store sequence, mirroring Store.invoiceSeq.
      const seqStore = await tx.store.update({
        where: { id: order.storeId },
        data: { returnSeq: { increment: 1 } },
        select: { returnSeq: true },
      });
      const returnNumber = `RET-${order.storeId.slice(0, 8).toUpperCase()}-${String(
        seqStore.returnSeq,
      ).padStart(6, "0")}`;

      // Created first so every downstream row (ledger entries, loyalty) can reference it
      // directly — no fragile "backfill the rows I just wrote" pass.
      const salesReturn = await tx.salesReturn.create({
        data: {
          storeId: order.storeId,
          returnNumber,
          originalOrderId: order.id,
          customerId: order.customerId,
          processedById: userId,
          type: dto.type,
          reason: dto.reason,
          refundSubtotal,
          refundTaxTotal,
          refundTotal,
          refundMethod: dto.refundMethod,
          pointsAdjusted,
          lines: { create: returnLineData },
        },
      });

      // Goods go back on the shelf BEFORE the exchange sale is priced, so a customer can
      // swap straight into the size they just handed over.
      for (const line of returnLineData) {
        if (!line.restock) continue;
        await this.inventory.postStockMovement(
          {
            storeId: order.storeId,
            variantId: line.variantId,
            entryType: "sale_return",
            quantityDelta: line.quantity,
            referenceType: "sales_return",
            referenceId: salesReturn.id,
            performedById: userId,
          },
          tx,
        );
      }

      let exchangeOrderId: string | null = null;
      let exchangeTotal = 0;
      if (dto.type === "exchange" && dto.exchangeLines?.length) {
        // A normal sale in every respect — deducts stock, earns points, shows in reporting.
        // Its payment is recorded at full value; the refund is a separate movement, so the
        // customer physically settles only the difference (balanceDue).
        const exchangeValue = await this.estimateExchangeTotal(dto.exchangeLines, vatRate);
        const exchangeOrder = await this.sales.checkoutInTx(
          {
            storeId: order.storeId,
            customerId: order.customerId ?? undefined,
            lines: dto.exchangeLines.map((l) => ({
              variantId: l.variantId,
              quantity: l.quantity,
              discountAmount: l.discountAmount,
            })),
            payments: [{ method: dto.balancePaymentMethod ?? "cash", amount: exchangeValue }],
          },
          userId,
          tx,
        );
        exchangeOrderId = exchangeOrder.id;
        exchangeTotal = Number(exchangeOrder.grandTotal);
      }

      const created = await tx.salesReturn.update({
        where: { id: salesReturn.id },
        data: { exchangeOrderId, exchangeTotal, balanceDue: money(exchangeTotal - refundTotal) },
        include: RETURN_INCLUDE,
      });

      if (order.customerId && pointsAdjusted !== 0) {
        await tx.loyaltyTransaction.create({
          data: {
            customerId: order.customerId,
            storeId: order.storeId,
            type: "adjustment",
            pointsDelta: pointsAdjusted,
            referenceType: "sales_return",
            referenceId: created.id,
            performedById: userId,
            note: `Return ${returnNumber} against ${order.invoiceNumber}`,
          },
        });
      }

      // --- Roll the original order's status forward ----------------------
      const returnedByLine = new Map<string, number>();
      for (const l of order.lines) {
        returnedByLine.set(l.id, l.returnLines.reduce((sum, r) => sum + r.quantity, 0));
      }
      for (const l of returnLineData) {
        returnedByLine.set(l.orderLineId, (returnedByLine.get(l.orderLineId) ?? 0) + l.quantity);
      }
      const fullyReturned = order.lines.every(
        (l) => (returnedByLine.get(l.id) ?? 0) >= l.quantity,
      );
      const anyReturned = order.lines.some((l) => (returnedByLine.get(l.id) ?? 0) > 0);
      const nextStatus = fullyReturned ? "returned" : anyReturned ? "partially_returned" : order.status;
      if (nextStatus !== order.status) {
        await tx.salesOrder.update({ where: { id: order.id }, data: { status: nextStatus } });
      }

      return created;
    });

    await this.audit.record({
      entityType: "sales_return",
      entityId: result.id,
      action: "create",
      performedById: userId,
      after: {
        returnNumber: result.returnNumber,
        type: dto.type,
        refundTotal,
        exchangeTotal: Number(result.exchangeTotal),
        balanceDue: Number(result.balanceDue),
        pointsAdjusted,
        originalInvoice: order.invoiceNumber,
      },
    });

    const loyalty = order.customerId
      ? {
          pointsBalance: await this.customers.getPointsBalance(order.customerId),
          tier: await this.customers.computeTier(
            order.storeId,
            (await this.customers.computeStats(order.customerId)).lifetimeSpending,
          ),
        }
      : null;

    return { ...result, loyaltySnapshot: loyalty };
  }

  /**
   * Server-side price for the replacement basket so the exchange sale's payment matches
   * its own computed grand total (SalesService re-derives prices and rejects a mismatch).
   */
  private async estimateExchangeTotal(
    lines: { variantId: string; quantity: number; discountAmount?: number }[],
    vatRate: number,
  ): Promise<number> {
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: lines.map((l) => l.variantId) } },
      include: { product: true },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    for (const l of lines) {
      const v = byId.get(l.variantId);
      if (!v) throw new BadRequestException(`Variant ${l.variantId} not found`);
      const unitPrice = Number(v.sellingPriceOverride ?? v.product.baseSellingPrice);
      const discount = l.discountAmount ?? 0;
      const net = Number(((unitPrice - discount) * l.quantity).toFixed(2));
      subtotal += unitPrice * l.quantity;
      discountTotal += discount * l.quantity;
      taxTotal += Number((net * (vatRate / 100)).toFixed(2));
    }
    return money(money(subtotal) - money(discountTotal) + money(taxTotal));
  }

  findAll(storeId?: string) {
    return this.prisma.salesReturn.findMany({
      where: storeId ? { storeId } : undefined,
      include: RETURN_INCLUDE,
      orderBy: { returnDate: "desc" },
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.salesReturn.findUnique({
      where: { id },
      include: RETURN_INCLUDE,
    });
    if (!found) throw new NotFoundException(`Return ${id} not found`);
    return found;
  }
}
