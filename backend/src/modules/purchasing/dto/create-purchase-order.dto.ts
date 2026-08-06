import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class CreatePurchaseOrderLineDto {
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  quantityOrdered: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cartons?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  piecesPerCarton?: number;

  @IsNumber()
  @Min(0)
  costPrice: number;

  @IsNumber()
  @Min(0)
  sellingPriceAtOrder: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  storeId: string;

  @IsUUID()
  supplierId: string;

  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  lines: CreatePurchaseOrderLineDto[];
}
