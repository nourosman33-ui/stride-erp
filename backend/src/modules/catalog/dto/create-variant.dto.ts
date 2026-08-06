import { IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class CreateVariantDto {
  @IsUUID()
  sizeValueId: string;

  @IsUUID()
  colorId: string;

  /** Auto-generated when omitted (FR-CAT-4). */
  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderPoint?: number;
}
