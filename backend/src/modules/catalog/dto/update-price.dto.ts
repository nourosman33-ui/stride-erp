import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class UpdatePriceDto {
  @IsIn(["cost_price", "selling_price"])
  field: "cost_price" | "selling_price";

  @IsNumber()
  @Min(0)
  newValue: number;

  /** Omit to change the product's base price; provide to override one variant (FR-CAT-5). */
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
