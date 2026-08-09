import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

/**
 * Editing a product's prices here changes the *list* price used by future sales. It does
 * NOT restate the cost of stock already on the shelf — that is stamped on the stock ledger
 * when the goods arrived. Use POST /inventory/revalue to correct existing stock.
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  modelName?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  genderId?: string;

  @IsOptional()
  @IsUUID()
  productTypeId?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseCostPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseSellingPrice?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPriceOverride?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPriceOverride?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
