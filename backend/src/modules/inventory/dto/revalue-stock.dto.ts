import { IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

/** Sets the cost basis of stock already on hand — see InventoryService.revalueStock. */
export class RevalueStockDto {
  @IsUUID()
  storeId: string;

  @IsUUID()
  variantId: string;

  @IsNumber()
  @Min(0)
  newUnitCost: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
