import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";
import { PAYMENT_METHODS, type PaymentMethodInput } from "./create-daily-expense.dto";

export const EXPENSE_QUICK_PERIODS = ["today", "week", "month", "year"] as const;
export type ExpenseQuickPeriod = (typeof EXPENSE_QUICK_PERIODS)[number];

export const EXPENSE_STATUSES = ["pending", "approved", "rejected"] as const;
export type ExpenseStatusInput = (typeof EXPENSE_STATUSES)[number];

/**
 * A dedicated DTO rather than individual @Query() params (FinanceController's usual
 * style) — this endpoint has 10+ optional filters, which gets unwieldy and easy to
 * miss-type as separate method arguments.
 */
export class ListExpensesQueryDto {
  @IsUUID()
  storeId: string;

  @IsOptional()
  @IsIn(EXPENSE_QUICK_PERIODS)
  period?: ExpenseQuickPeriod;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethodInput;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn(EXPENSE_STATUSES)
  status?: ExpenseStatusInput;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountMax?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;
}
