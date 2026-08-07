import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

const PAYMENT_METHODS = ["cash", "card", "mobile_wallet", "bank_transfer"] as const;
export type PaymentMethodInput = (typeof PAYMENT_METHODS)[number];

export class SaleLineInputDto {
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  /** Per-unit discount (FR-SAL-2). Selling price itself is resolved server-side from the variant. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}

export class SalePaymentInputDto {
  @IsIn(PAYMENT_METHODS)
  method: PaymentMethodInput;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  referenceNo?: string;
}

export class CreateSaleDto {
  @IsUUID()
  storeId: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleLineInputDto)
  lines: SaleLineInputDto[];

  /** FR-SAL-3: multiple rows support split payments; SUM(amount) must equal grand_total. */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalePaymentInputDto)
  payments: SalePaymentInputDto[];
}
