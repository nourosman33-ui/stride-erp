import { IsInt, IsOptional, IsString, IsUUID, NotEquals } from "class-validator";

export class AdjustLoyaltyDto {
  @IsUUID()
  storeId: string;

  /** Signed: positive = grant points, negative = deduct. */
  @IsInt()
  @NotEquals(0)
  pointsDelta: number;

  @IsOptional()
  @IsString()
  note?: string;
}
