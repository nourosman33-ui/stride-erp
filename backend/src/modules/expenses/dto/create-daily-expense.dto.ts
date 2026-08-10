import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

export const PAYMENT_METHODS = ["cash", "card", "mobile_wallet", "bank_transfer"] as const;
export type PaymentMethodInput = (typeof PAYMENT_METHODS)[number];

export class CreateDailyExpenseDto {
  @IsUUID()
  storeId: string;

  @IsUUID()
  categoryId: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsIn(PAYMENT_METHODS)
  paymentMethod: PaymentMethodInput;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
