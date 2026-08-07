import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

/** Per-combination override, for when one size/color should not get the blanket opening quantity. */
export class VariantQuantityDto {
  @IsUUID()
  sizeValueId: string;

  @IsUUID()
  colorId: string;

  @IsInt()
  @Min(0)
  quantity: number;
}

/**
 * One-shot "add a product to inventory": product + every size×color variant +
 * opening stock, in a single transaction. Replaces the 1 + N + N round-trips the
 * separate create-product / add-variant / post-adjustment endpoints required.
 * Those endpoints still exist and are unchanged — this sits alongside them.
 */
export class QuickAddProductDto {
  @IsString()
  modelName: string;

  @IsUUID()
  categoryId: string;

  @IsUUID()
  genderId: string;

  @IsUUID()
  productTypeId: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsNumber()
  @Min(0)
  baseCostPrice: number;

  @IsNumber()
  @Min(0)
  baseSellingPrice: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  /** Store the opening stock lands in. */
  @IsUUID()
  storeId: string;

  // Cartesian product of these two is the variant set. Capped so a mis-click can't
  // create thousands of rows in one transaction.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @IsUUID("4", { each: true })
  sizeValueIds: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID("4", { each: true })
  colorIds: string[];

  /** Applied to every variant that has no explicit override below. 0 = create the variant with no stock. */
  @IsOptional()
  @IsInt()
  @Min(0)
  openingQuantity?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantQuantityDto)
  variantQuantities?: VariantQuantityDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderPoint?: number;
}
