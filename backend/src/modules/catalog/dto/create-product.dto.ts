import { IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class CreateProductDto {
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
}
