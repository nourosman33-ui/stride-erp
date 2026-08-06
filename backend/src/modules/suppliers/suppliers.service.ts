import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { LinkProductSupplierDto } from "./dto/link-product.dto";
import { RecordSupplierPaymentDto } from "./dto/record-payment.dto";

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }

  findAll() {
    return this.prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }
    return supplier;
  }

  async linkProduct(supplierId: string, dto: LinkProductSupplierDto) {
    await this.findOne(supplierId);
    return this.prisma.productSupplier.upsert({
      where: { productId_supplierId: { productId: dto.productId, supplierId } },
      update: {
        supplierCostPrice: dto.supplierCostPrice,
        piecesPerCarton: dto.piecesPerCarton,
        isPreferred: dto.isPreferred ?? false,
      },
      create: {
        supplierId,
        productId: dto.productId,
        supplierCostPrice: dto.supplierCostPrice,
        piecesPerCarton: dto.piecesPerCarton,
        isPreferred: dto.isPreferred ?? false,
      },
    });
  }

  listLinkedProducts(supplierId: string) {
    return this.prisma.productSupplier.findMany({
      where: { supplierId },
      include: { product: true },
    });
  }

  /**
   * Records an actual cash movement against a supplier and rolls forward a
   * running balance (FR-SUP-3). deposit/payment increase cumulative amount
   * paid to date; credit_note (e.g. a refund for damaged/short-shipped
   * stock) reduces it. This tracks cash paid, not a full accounts-payable
   * balance — the workbook's Suppliers sheet only ever recorded payment
   * *terms* as free text ("50% deposit / 50% on delivery"), never actuals.
   */
  async recordPayment(supplierId: string, dto: RecordSupplierPaymentDto) {
    await this.findOne(supplierId);

    const lastEntry = await this.prisma.supplierLedgerEntry.findFirst({
      where: { supplierId },
      orderBy: { createdAt: "desc" },
    });
    const previousBalance = lastEntry ? Number(lastEntry.balanceAfter) : 0;
    const signedAmount = dto.type === "credit_note" ? -dto.amount : dto.amount;
    const balanceAfter = Number((previousBalance + signedAmount).toFixed(2));

    return this.prisma.supplierLedgerEntry.create({
      data: {
        supplierId,
        purchaseOrderId: dto.purchaseOrderId,
        type: dto.type,
        amount: dto.amount,
        balanceAfter,
        note: dto.note,
      },
    });
  }

  getLedger(supplierId: string) {
    return this.prisma.supplierLedgerEntry.findMany({
      where: { supplierId },
      orderBy: { createdAt: "desc" },
    });
  }
}
