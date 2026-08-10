import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";
import { PAYMENT_METHODS, type PaymentMethodInput } from "./create-daily-expense.dto";

export class UpdateDailyExpenseDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethodInput;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
