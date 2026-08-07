import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  name?: string;

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

  // Settings: branding, receipt, returns, loyalty (FR-CFG / loyalty program).
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsString()
  receiptFooterLine1?: string;

  @IsOptional()
  @IsString()
  receiptFooterLine2?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  returnPeriodDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyPointsPerCurrency?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyPointValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltySilverThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyGoldThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyPlatinumThreshold?: number;
}
