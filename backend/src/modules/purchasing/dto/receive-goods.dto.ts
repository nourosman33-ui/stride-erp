import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class GoodsReceiptLineDto {
  @IsUUID()
  purchaseOrderLineId: string;

  @IsInt()
  @Min(0)
  quantityReceived: number;

  @IsOptional()
  @IsString()
  discrepancyReason?: string;
}

export class ReceiveGoodsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines: GoodsReceiptLineDto[];
}
