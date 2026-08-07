import { IsDateString, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateStoreDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sizeSqm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  frontageM?: number;

  @IsOptional()
  @IsDateString()
  openingDate?: string;

  @IsOptional()
  @IsString()
  concept?: string;

  @IsOptional()
  @IsString()
  targetMarket?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  poApprovalThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountApprovalLimitPct?: number;
}
