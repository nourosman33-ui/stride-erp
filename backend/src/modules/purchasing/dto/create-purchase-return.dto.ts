import { IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class CreatePurchaseReturnDto {
  @IsUUID()
  storeId: string;

  @IsUUID()
  variantId: string;

  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  reason: string;
}
