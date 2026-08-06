import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateSupplierDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  factoryName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsString()
  socialContact?: string;

  @IsOptional()
  @IsString()
  minimumOrder?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDaysMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDaysMax?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  qualityRating?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
