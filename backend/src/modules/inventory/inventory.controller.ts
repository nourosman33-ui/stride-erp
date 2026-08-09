import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { InventoryService } from "./inventory.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateAdjustmentDto } from "./dto/create-adjustment.dto";
import { RevalueStockDto } from "./dto/revalue-stock.dto";

@Controller("inventory")
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly audit: AuditService,
  ) {}

  // Cost/value-bearing inventory views — never available to cashiers (POS uses
  // GET /sales/pos-catalog, which reports quantity only, instead).
  @Get("stock/:storeId")
  @Roles("owner", "manager", "inventory_clerk", "accountant")
  listStock(@Param("storeId") storeId: string) {
    return this.inventoryService.listStockOnHand(storeId);
  }

  @Get("stock/:storeId/:variantId")
  @Roles("owner", "manager", "inventory_clerk", "accountant")
  getStock(@Param("storeId") storeId: string, @Param("variantId") variantId: string) {
    return this.inventoryService.getStockOnHand(storeId, variantId);
  }

  @Get("movement-status/:storeId/:variantId")
  @Roles("owner", "manager", "inventory_clerk", "accountant")
  getMovementStatus(
    @Param("storeId") storeId: string,
    @Param("variantId") variantId: string,
  ) {
    return this.inventoryService.getMovementStatus(storeId, variantId);
  }

  @Get("value/:storeId")
  @Roles("owner", "manager", "inventory_clerk", "accountant")
  getTotalValue(@Param("storeId") storeId: string) {
    return this.inventoryService.getTotalInventoryValue(storeId).then((total) => ({
      storeId,
      totalInventoryValue: total,
    }));
  }

  @Get("reorder-alerts/:storeId")
  @Roles("owner", "manager", "inventory_clerk", "accountant")
  getReorderAlerts(@Param("storeId") storeId: string) {
    return this.inventoryService.getReorderAlerts(storeId);
  }

  /**
   * Corrects the cost of stock already on hand (see InventoryService.revalueStock).
   * Owner/manager only — it moves reported inventory value and therefore COGS.
   */
  @Post("revalue")
  @Roles("owner", "manager")
  async revalue(
    @Body() dto: RevalueStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.inventoryService.revalueStock({
      storeId: dto.storeId,
      variantId: dto.variantId,
      newUnitCost: dto.newUnitCost,
      performedById: user.userId,
      reason: dto.reason,
    });

    await this.audit.record({
      entityType: "product_variant",
      entityId: dto.variantId,
      action: "update",
      performedById: user.userId,
      before: { avgUnitCost: result.previousUnitCost },
      after: { avgUnitCost: result.newUnitCost, quantityOnHand: result.quantityOnHand },
    });

    return result;
  }

  @Post("adjustments")
  @Roles("owner", "manager", "inventory_clerk")
  async createAdjustment(
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const entry = await this.inventoryService.postStockMovement({
      storeId: dto.storeId,
      variantId: dto.variantId,
      entryType: "adjustment",
      quantityDelta: dto.quantityDelta,
      reasonCode: dto.reasonCode,
      referenceType: "manual",
      performedById: user.userId,
    });

    await this.audit.record({
      entityType: "stock_ledger_entry",
      entityId: entry.id,
      action: "create",
      performedById: user.userId,
      after: { ...dto },
    });

    return entry;
  }
}
