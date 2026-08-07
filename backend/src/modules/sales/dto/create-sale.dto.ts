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

/** Create-a-customer-inline-at-checkout — used when the phone lookup found no match. */
export class NewCustomerInputDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class CreateSaleDto {
  @IsUUID()
  storeId: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewCustomerInputDto)
  newCustomer?: NewCustomerInputDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleLineInputDto)
  lines: SaleLineInputDto[];

  /**
   * FR-SAL-3: multiple rows support split payments; SUM(amount) + (redeemPoints value)
   * must equal grand_total.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalePaymentInputDto)
  payments: SalePaymentInputDto[];

  /** Loyalty points to redeem against this sale — requires an attached customer with sufficient balance. */
  @IsOptional()
  @IsInt()
  @Min(0)
  redeemPoints?: number;

  /** Cash handed over by the customer, for change calculation/display on the receipt. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountTendered?: number;
}
