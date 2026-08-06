import { IsBoolean, IsInt, IsNumber, IsOptional, IsUUID, Min } from "class-validator";

export class LinkProductSupplierDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0)
  supplierCostPrice: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  piecesPerCarton?: number;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;
}
