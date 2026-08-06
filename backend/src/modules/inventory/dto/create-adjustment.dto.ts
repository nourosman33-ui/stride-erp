import { IsInt, IsNotEmpty, IsString, IsUUID, NotEquals } from "class-validator";

export class CreateAdjustmentDto {
  @IsUUID()
  storeId: string;

  @IsUUID()
  variantId: string;

  /** Signed: positive = found stock, negative = loss/damage/theft (FR-INV-5). */
  @IsInt()
  @NotEquals(0)
  quantityDelta: number;

  @IsString()
  @IsNotEmpty()
  reasonCode: string;
}
