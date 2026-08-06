import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { InventoryService } from "../inventory/inventory.service";
import { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import { ReceiveGoodsDto } from "./dto/receive-goods.dto";
import { CreatePurchaseReturnDto } from "./dto/create-purchase-return.dto";

@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  /** FR-PUR-1/2: creates a PO with computed line totals, mirroring Inventory Plan's formulas. */
  async createPurchaseOrder(dto: CreatePurchaseOrderDto, performedById: string) {
    const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
    if (!store) {
      throw new NotFoundException(`Store ${dto.storeId} not found`);
    }

    const lineData = dto.lines.map((line) => ({
      variantId: line.variantId,
      quantityOrdered: line.quantityOrdered,
      cartons: line.cartons,
      piecesPerCarton: line.piecesPerCarton,
      costPrice: line.costPrice,
      sellingPriceAtOrder: line.sellingPriceAtOrder,
      lineTotal: Number((line.costPrice * line.quantityOrdered).toFixed(2)),
      expectedProfit: Number(
        ((line.sellingPriceAtOrder - line.costPrice) * line.quantityOrdered).toFixed(2),
      ),
    }));

    const orderTotal = lineData.reduce((sum, l) => sum + l.lineTotal, 0);
    // FR-PUR-4: orders above the store's threshold require explicit approval before receiving.
    const status =
      orderTotal > Number(store.poApprovalThreshold) ? "pending_approval" : "approved";

    const po = await this.prisma.purchaseOrder.create({
      data: {
        storeId: dto.storeId,
        supplierId: dto.supplierId,
        status,
        expectedDeliveryDate: dto.expectedDeliveryDate
          ? new Date(dto.expectedDeliveryDate)
          : undefined,
        notes: dto.notes,
        createdById: performedById,
        lines: { create: lineData },
      },
      include: { lines: true },
    });

    await this.audit.record({
      entityType: "purchase_order",
      entityId: po.id,
      action: "create",
      performedById,
      after: { supplierId: dto.supplierId, orderTotal, status },
    });

    return po;
  }

  async findOne(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        lines: {
          include: { variant: { include: { product: true, sizeValue: true, color: true } } },
        },
        supplier: true,
        goodsReceipts: { include: { lines: true } },
      },
    });
    if (!po) {
      throw new NotFoundException(`Purchase order ${id} not found`);
    }
    return po;
  }

  findAll(storeId?: string) {
    return this.prisma.purchaseOrder.findMany({
      where: storeId ? { storeId } : undefined,
      include: { lines: true, supplier: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /** FR-PUR-4: manager/owner approval for POs above the store's threshold. */
  async approve(id: string, approvedById: string) {
    const po = await this.findOne(id);
    if (po.status !== "pending_approval") {
      throw new BadRequestException(
        `Purchase order is "${po.status}" and cannot be approved from this state`,
      );
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: "approved", approvedById },
    });

    await this.audit.record({
      entityType: "purchase_order",
      entityId: id,
      action: "approve",
      performedById: approvedById,
      before: { status: "pending_approval" },
      after: { status: "approved" },
    });

    return updated;
  }

  /**
   * FR-PUR-3: posts a Goods Receipt against an approved PO. Every line posts
   * a stock_ledger_entry (type=receipt) through InventoryService inside the
   * same DB transaction as the receipt records — Purchasing never writes to
   * the stock ledger directly (see InventoryService header comment).
   */
  async receiveGoods(poId: string, dto: ReceiveGoodsDto, performedById: string) {
    const po = await this.findOne(poId);
    if (!["approved", "partially_received"].includes(po.status)) {
      throw new BadRequestException(
        `Purchase order must be approved before receiving goods (current status: ${po.status})`,
      );
    }

    const poLineMap = new Map(po.lines.map((l) => [l.id, l]));
    let hasDiscrepancy = false;

    for (const line of dto.lines) {
      const poLine = poLineMap.get(line.purchaseOrderLineId);
      if (!poLine) {
        throw new BadRequestException(
          `Line ${line.purchaseOrderLineId} does not belong to this purchase order`,
        );
      }
      if (line.quantityReceived !== poLine.quantityOrdered) {
        hasDiscrepancy = true;
      }
    }

    const receipt = await this.prisma.$transaction(async (tx) => {
      const createdReceipt = await tx.goodsReceipt.create({
        data: {
          purchaseOrderId: poId,
          receivedById: performedById,
          status: hasDiscrepancy ? "discrepancy" : "full",
          lines: {
            create: dto.lines.map((line) => ({
              purchaseOrderLineId: line.purchaseOrderLineId,
              quantityReceived: line.quantityReceived,
              quantityExpected: poLineMap.get(line.purchaseOrderLineId)!.quantityOrdered,
              discrepancyReason: line.discrepancyReason,
            })),
          },
        },
        include: { lines: true },
      });

      for (const receiptLine of createdReceipt.lines) {
        if (receiptLine.quantityReceived <= 0) continue;
        const poLine = poLineMap.get(receiptLine.purchaseOrderLineId)!;
        await this.inventory.postStockMovement(
          {
            storeId: po.storeId,
            variantId: poLine.variantId,
            entryType: "receipt",
            quantityDelta: receiptLine.quantityReceived,
            unitCost: Number(poLine.costPrice),
            referenceType: "purchase_order",
            referenceId: poId,
            performedById,
            goodsReceiptLineId: receiptLine.id,
          },
          tx,
        );
      }

      const allReceiptLines = await tx.goodsReceiptLine.findMany({
        where: { purchaseOrderLine: { purchaseOrderId: poId } },
      });
      const receivedByLine = new Map<string, number>();
      for (const rl of allReceiptLines) {
        receivedByLine.set(
          rl.purchaseOrderLineId,
          (receivedByLine.get(rl.purchaseOrderLineId) ?? 0) + rl.quantityReceived,
        );
      }
      const fullyReceived = po.lines.every(
        (l) => (receivedByLine.get(l.id) ?? 0) >= l.quantityOrdered,
      );

      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: fullyReceived ? "received" : "partially_received" },
      });

      return createdReceipt;
    });

    await this.audit.record({
      entityType: "goods_receipt",
      entityId: receipt.id,
      action: "create",
      performedById,
      after: { purchaseOrderId: poId, status: receipt.status },
    });

    return receipt;
  }

  /** FR-PUR-5: return stock to a supplier (defective / wrong item shipped). */
  async createPurchaseReturn(dto: CreatePurchaseReturnDto, performedById: string) {
    const purchaseReturn = await this.prisma.$transaction(async (tx) => {
      const created = await tx.purchaseReturn.create({
        data: {
          purchaseOrderId: dto.purchaseOrderId,
          variantId: dto.variantId,
          quantity: dto.quantity,
          reason: dto.reason,
          createdById: performedById,
        },
      });

      await this.inventory.postStockMovement(
        {
          storeId: dto.storeId,
          variantId: dto.variantId,
          entryType: "purchase_return",
          quantityDelta: -dto.quantity,
          referenceType: "purchase_return",
          referenceId: created.id,
          performedById,
          purchaseReturnId: created.id,
        },
        tx,
      );

      return created;
    });

    await this.audit.record({
      entityType: "purchase_return",
      entityId: purchaseReturn.id,
      action: "create",
      performedById,
      after: { variantId: dto.variantId, quantity: dto.quantity, reason: dto.reason },
    });

    return purchaseReturn;
  }
}
