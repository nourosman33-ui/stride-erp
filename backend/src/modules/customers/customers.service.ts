import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { AdjustLoyaltyDto } from "./dto/adjust-loyalty.dto";

export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

/**
 * Owns the customer directory and the loyalty read model. Points balance and lifetime
 * spend/tier are always derived — never stored counters on Customer — same "compute,
 * don't cache" principle as InventoryService.getStockOnHand. Loyalty *earning* happens in
 * SalesService.checkout (the only writer of loyalty_transaction besides manual adjustment
 * here), which posts through this service's ledger just like Sales posts through
 * InventoryService for stock.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: { ...dto, birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined },
    });
  }

  async findAll(search?: string) {
    const customers = await this.prisma.customer.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return Promise.all(customers.map((c) => this.withStats(c)));
  }

  async findByPhone(phone: string) {
    const customer = await this.prisma.customer.findUnique({ where: { phone } });
    if (!customer) return null;
    return this.withStats(customer);
  }

  async findOne(id: string, storeId?: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        salesOrders: {
          orderBy: { orderDate: "desc" },
          take: 20,
          include: {
            lines: { include: { variant: { include: { product: true } } } },
            payments: true,
            store: true,
          },
        },
        loyaltyTransactions: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    const stats = await this.computeStats(id);
    const pointsBalance = await this.getPointsBalance(id);
    const tier = await this.computeTier(storeId, stats.lifetimeSpending);
    return { ...customer, ...stats, pointsBalance, tier };
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.ensureExists(id);
    return this.prisma.customer.update({
      where: { id },
      data: { ...dto, birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined },
    });
  }

  /** Always SUM(points_delta) — never a mutable counter (mirrors stock-on-hand). */
  async getPointsBalance(customerId: string): Promise<number> {
    const result = await this.prisma.loyaltyTransaction.aggregate({
      where: { customerId },
      _sum: { pointsDelta: true },
    });
    return result._sum.pointsDelta ?? 0;
  }

  async computeStats(customerId: string) {
    const agg = await this.prisma.salesOrder.aggregate({
      where: { customerId, status: { not: "voided" } },
      _sum: { grandTotal: true },
      _count: true,
      _max: { orderDate: true },
    });
    return {
      totalOrders: agg._count,
      lifetimeSpending: Number(agg._sum.grandTotal ?? 0),
      lastPurchaseAt: agg._max.orderDate,
    };
  }

  /** Tier thresholds live on Store (configurable per-store); spend is summed across all stores. */
  async computeTier(storeId: string | undefined, lifetimeSpending: number): Promise<LoyaltyTier> {
    const store = storeId
      ? await this.prisma.store.findUnique({ where: { id: storeId } })
      : await this.prisma.store.findFirst({ where: { isActive: true } });
    if (!store) return "bronze";
    if (lifetimeSpending >= Number(store.loyaltyPlatinumThreshold)) return "platinum";
    if (lifetimeSpending >= Number(store.loyaltyGoldThreshold)) return "gold";
    if (lifetimeSpending >= Number(store.loyaltySilverThreshold)) return "silver";
    return "bronze";
  }

  async adjustLoyalty(customerId: string, dto: AdjustLoyaltyDto, performedById: string) {
    await this.ensureExists(customerId);
    const entry = await this.prisma.loyaltyTransaction.create({
      data: {
        customerId,
        storeId: dto.storeId,
        type: "adjustment",
        pointsDelta: dto.pointsDelta,
        referenceType: "manual",
        performedById,
        note: dto.note,
      },
    });
    await this.audit.record({
      entityType: "loyalty_transaction",
      entityId: entry.id,
      action: "create",
      performedById,
      after: { customerId, pointsDelta: dto.pointsDelta, note: dto.note },
    });
    return entry;
  }

  private async withStats<T extends { id: string }>(customer: T) {
    const stats = await this.computeStats(customer.id);
    const pointsBalance = await this.getPointsBalance(customer.id);
    return { ...customer, ...stats, pointsBalance };
  }

  private async ensureExists(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }
}
