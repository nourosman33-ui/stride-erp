import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
const RETURN_TYPES = ["refund", "exchange"] as const;

export type RefundMethodInput = (typeof PAYMENT_METHODS)[number];
export type ReturnTypeInput = (typeof RETURN_TYPES)[number];

export class ReturnLineInputDto {
  /** The original sale line being returned — quantity is validated against it. */
  @IsUUID()
  orderLineId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  /**
   * False for damaged goods: the customer is still refunded, but the stock is not put
   * back on the shelf and its cost stays in COGS as a genuine loss.
   */
  @IsOptional()
  @IsBoolean()
  restock?: boolean;

  @IsOptional()
  @IsString()
  condition?: string;
}

/** Replacement item on an exchange — priced server-side exactly like a normal sale line. */
export class ExchangeLineInputDto {
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}

export class CreateReturnDto {
  @IsUUID()
  originalOrderId: string;

  @IsIn(RETURN_TYPES)
  type: ReturnTypeInput;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineInputDto)
  lines: ReturnLineInputDto[];

  /** Required when type = exchange. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExchangeLineInputDto)
  exchangeLines?: ExchangeLineInputDto[];

  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  refundMethod?: RefundMethodInput;

  /** How the customer settles a positive exchange balance. Defaults to cash. */
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  balancePaymentMethod?: RefundMethodInput;

  @IsOptional()
  @IsString()
  reason?: string;

  /**
   * Manager/owner escape hatch for a sale outside the store's return window.
   * Ignored for cashiers — the service re-checks the caller's roles.
   */
  @IsOptional()
  @IsBoolean()
  overrideReturnWindow?: boolean;
}
